import * as storage from '../core/storage.js';
import {
  ESTADOS_CITA,
  ErrorDeDominio,
  listarCitasPorAtender,
  normalizarTexto,
  notificar,
  obtenerCitaDetallada,
  obtenerMedico,
  puedeRegistrarDiagnostico,
  registrarEventoCita,
} from '../core/dominio.js';
import { ahoraISO, desdeISO, formatearFecha, formatearFechaLarga } from '../core/fechas.js';
import { construirHash } from '../core/navigation.js';
import {
  confirmarAccion,
  escaparHtml,
  icono,
  insigniaEstado,
  mostrarToast,
  renderizarAviso,
  renderizarAvatar,
  renderizarCodigoCie10,
  renderizarEncabezado,
  renderizarListaCitas,
  renderizarStepper,
  renderizarVacio,
} from '../core/ui.js';
import { CATALOGO_CIE10 } from '../data/cie10.js';

const ID_MODULO = 'diagnostico';
const PASOS = ['Identificar cita', 'Diagnóstico', 'Confirmación'];
const PASO_SELECCION = 0;
const PASO_REGISTRO = 1;
const PASO_CONFIRMACION = 2;
const LIMITE_HISTORIAL = 5;
const LIMITE_SUGERENCIAS = 8;
const MINIMO_CARACTERES_BUSQUEDA = 2;
const MINIMO_CARACTERES_DIAGNOSTICO = 3;

function crearTratamientoVacio() {
  return { tratamiento: '', indicaciones: '' };
}

function crearBorradorInicial() {
  return { diagnostico: '', codigoCie10: '', tratamientos: [crearTratamientoVacio()], observaciones: '' };
}

function esCitaAtendible(cita, medicoId) {
  return Boolean(cita) && cita.medicoId === medicoId && puedeRegistrarDiagnostico(cita);
}

function calcularEdad(fechaNacimiento) {
  const nacimiento = desdeISO(fechaNacimiento);
  const hoy = new Date();
  const cumplioAnio = hoy.getMonth() > nacimiento.getMonth()
    || (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() >= nacimiento.getDate());
  return hoy.getFullYear() - nacimiento.getFullYear() - (cumplioAnio ? 0 : 1);
}

function listarHistorialPrevio(pacienteId) {
  return storage
    .filtrar('historialClinico', (registro) => registro.pacienteId === pacienteId)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, LIMITE_HISTORIAL);
}

function buscarSugerencias(texto) {
  const consulta = normalizarTexto(texto);
  if (consulta.length < MINIMO_CARACTERES_BUSQUEDA) return [];
  const terminos = consulta.split(/\s+/);
  return CATALOGO_CIE10
    .map((entrada) => ({ entrada, completo: normalizarTexto(`${entrada.codigo} ${entrada.nombre}`), nombre: normalizarTexto(entrada.nombre) }))
    .filter(({ completo }) => terminos.every((termino) => completo.includes(termino)))
    .sort((a, b) => Number(b.nombre.startsWith(consulta)) - Number(a.nombre.startsWith(consulta)) || a.entrada.nombre.localeCompare(b.entrada.nombre))
    .slice(0, LIMITE_SUGERENCIAS)
    .map(({ entrada }) => entrada);
}

function obtenerTratamientosValidos(borrador) {
  return borrador.tratamientos.filter((fila) => fila.tratamiento || fila.indicaciones);
}

function validarBorrador(borrador) {
  const errores = {};
  if (borrador.diagnostico.length < MINIMO_CARACTERES_DIAGNOSTICO) {
    errores.diagnostico = 'Escribe el diagnóstico principal o elige una sugerencia.';
  }
  const filas = obtenerTratamientosValidos(borrador);
  if (!filas.length) {
    errores.tratamientos = 'Indica al menos un tratamiento (medicamento o recomendación).';
  } else if (filas.some((fila) => !fila.tratamiento)) {
    errores.tratamientos = 'Cada indicación debe tener su tratamiento.';
  }
  return errores;
}

function registrarAtencion({ citaId, medicoId, borrador }) {
  return storage.ejecutarTransaccion(() => {
    const cita = obtenerCitaDetallada(citaId);
    if (!esCitaAtendible(cita, medicoId)) {
      throw new ErrorDeDominio('La cita ya no está disponible para registrar un diagnóstico.', 'cita-no-atendible');
    }
    const medico = obtenerMedico(medicoId);
    const tratamientos = obtenerTratamientosValidos(borrador);
    const indicaciones = tratamientos
      .filter((fila) => fila.indicaciones)
      .map((fila) => `${fila.tratamiento}: ${fila.indicaciones}`)
      .join('. ');

    const registro = storage.insertar('historialClinico', {
      pacienteId: cita.pacienteId,
      medicoId,
      citaId,
      fecha: cita.fecha,
      diagnostico: borrador.diagnostico,
      codigoCie10: borrador.codigoCie10,
      tratamientos,
      tratamiento: tratamientos.map((fila) => fila.tratamiento).join('; '),
      indicaciones: indicaciones || 'Sin indicaciones adicionales.',
      observaciones: borrador.observaciones || 'Sin observaciones.',
      registradoEn: ahoraISO(),
    });
    storage.actualizar('citas', citaId, { estado: ESTADOS_CITA.ATENDIDA });
    registrarEventoCita(citaId, 'Atención registrada con diagnóstico.', medico.nombre);
    notificar({
      destinatarioRol: 'paciente',
      destinatarioId: cita.pacienteId,
      titulo: 'Diagnóstico disponible',
      mensaje: `${medico.nombre} registró el diagnóstico de tu atención.`,
      citaId,
    });
    return { registro, cita };
  });
}

function renderizarPasoSeleccion(estado, medicoId) {
  const citas = listarCitasPorAtender(medicoId);
  const aviso = estado.avisoSeleccion ? renderizarAviso({ tipo: 'alerta', mensaje: estado.avisoSeleccion }) : '';
  if (!citas.length) {
    return `<section class="panel">${aviso}${renderizarVacio({ iconoVacio: 'diagnostico', titulo: 'No tienes citas por atender' })}</section>`;
  }
  return `
    <section class="panel">
      <h2 class="panel__titulo">Citas por atender</h2>
      ${aviso}
      ${renderizarListaCitas(citas, { mostrar: 'paciente', crearEnlace: (cita) => construirHash(ID_MODULO, { cita: cita.id }) })}
    </section>`;
}

function renderizarHistorial(pacienteId) {
  const registros = listarHistorialPrevio(pacienteId);
  if (!registros.length) return '<p class="diagnostico__sin-historial">Sin diagnósticos previos registrados.</p>';
  return `
    <ul class="diagnostico__historial">
      ${registros.map((registro) => `
        <li>
          <time datetime="${escaparHtml(registro.fecha)}">${escaparHtml(formatearFecha(registro.fecha))}</time>
          <strong>${escaparHtml(registro.diagnostico)} ${renderizarCodigoCie10(registro.codigoCie10)}</strong>
        </li>`).join('')}
    </ul>`;
}

function renderizarSugerencias(sugerencias, indiceActivo) {
  return sugerencias.map((entrada, indice) => `
    <li class="autocompletar__opcion${indice === indiceActivo ? ' autocompletar__opcion--activa' : ''}" id="sugerencia-${indice}" role="option" data-indice="${indice}" aria-selected="${indice === indiceActivo}">
      <span class="codigo">${escaparHtml(entrada.codigo)}</span>${escaparHtml(entrada.nombre)}
    </li>`).join('');
}

function renderizarCampoDiagnostico(borrador, errores) {
  return `
    <div class="campo">
      <label class="campo__etiqueta" for="campo-diagnostico">Diagnóstico principal</label>
      <div class="autocompletar">
        <input class="entrada" id="campo-diagnostico" name="diagnostico" type="text" autocomplete="off" role="combobox"
          aria-autocomplete="list" aria-expanded="false" aria-controls="sugerenciasDiagnostico"
          placeholder="Escribe el diagnóstico o el código CIE-10" value="${escaparHtml(borrador.diagnostico)}"${errores.diagnostico ? ' aria-invalid="true"' : ''}>
        <input type="hidden" id="campo-codigoCie10" name="codigoCie10" value="${escaparHtml(borrador.codigoCie10)}">
        <ul class="autocompletar__lista" id="sugerenciasDiagnostico" role="listbox" aria-label="Diagnósticos sugeridos" hidden></ul>
      </div>
      <p class="campo__ayuda">Elige una sugerencia CIE-10 o escribe el diagnóstico completo si es nuevo.</p>
      ${errores.diagnostico ? `<p class="campo__error" role="alert">${escaparHtml(errores.diagnostico)}</p>` : ''}
    </div>`;
}

function renderizarFilaTratamiento(fila, indice, total) {
  return `
    <div class="tratamientos__fila" data-fila-tratamiento>
      <input class="entrada" data-campo-tratamiento aria-label="Tratamiento ${indice + 1}" placeholder="Ej. Paracetamol 500 mg, reposo, hidratación" value="${escaparHtml(fila.tratamiento)}">
      <input class="entrada" data-campo-indicaciones aria-label="Indicaciones del tratamiento ${indice + 1}" placeholder="Ej. 1 tableta cada 8 horas por 5 días" value="${escaparHtml(fila.indicaciones)}">
      <button class="boton-icono boton-icono--claro tratamientos__quitar" type="button" data-accion="quitar-tratamiento" data-indice="${indice}" aria-label="Quitar tratamiento ${indice + 1}"${total === 1 ? ' disabled' : ''}>${icono('cerrar')}</button>
    </div>`;
}

function renderizarTratamientos(borrador, errores) {
  return `
    <fieldset class="tratamientos">
      <legend class="campo__etiqueta">Tratamiento indicado</legend>
      <div class="tratamientos__cabecera"><span>Tratamiento</span><span>Indicaciones</span></div>
      ${borrador.tratamientos.map((fila, indice) => renderizarFilaTratamiento(fila, indice, borrador.tratamientos.length)).join('')}
      <button class="boton boton--suave boton--pequeno" type="button" data-accion="agregar-tratamiento">${icono('mas')}Agregar tratamiento</button>
      ${errores.tratamientos ? `<p class="campo__error" role="alert">${escaparHtml(errores.tratamientos)}</p>` : ''}
    </fieldset>`;
}

function renderizarPasoRegistro(estado) {
  const cita = obtenerCitaDetallada(estado.citaId);
  const { paciente } = cita;
  const { borrador, errores } = estado;
  return `
    <div class="diagnostico">
      <form class="panel diagnostico__formulario" id="formularioDiagnostico" novalidate>
        <h2 class="panel__titulo">Diagnóstico</h2>
        ${renderizarCampoDiagnostico(borrador, errores)}
        ${renderizarTratamientos(borrador, errores)}
        <div class="campo">
          <label class="campo__etiqueta" for="campo-observaciones">Observaciones <span class="campo__opcional">(opcional)</span></label>
          <textarea class="entrada" id="campo-observaciones" name="observaciones" rows="3">${escaparHtml(borrador.observaciones)}</textarea>
        </div>
        <div class="acciones-paso">
          <a class="boton boton--secundario" href="${construirHash('detalle-cita', { id: cita.id })}">${icono('flechaIzquierda')}Volver al detalle de cita</a>
          <button class="boton boton--primario" type="submit">${icono('diagnostico')}Registrar diagnóstico</button>
        </div>
        <div class="diagnostico__externos">
          <button class="boton boton--secundario" type="button" disabled>${icono('campana')}Enviar diagnóstico a paciente</button>
          <button class="boton boton--secundario" type="button" disabled>${icono('documento')}Registrar receta médica</button>
          <p>Estas opciones se habilitan una vez registrado el diagnóstico.</p>
        </div>
      </form>
      <aside class="diagnostico__lateral">
        <section class="panel">
          <div class="diagnostico__paciente">
            ${renderizarAvatar(paciente.nombre)}
            <div>
              <h2 class="panel__titulo">${escaparHtml(paciente.nombre)}</h2>
              <p>DNI ${escaparHtml(paciente.dni)} · ${calcularEdad(paciente.fechaNacimiento)} años</p>
            </div>
          </div>
          <dl class="lista-datos lista-datos--apilada">
            <div><dt>Cita</dt><dd>${escaparHtml(formatearFechaLarga(cita.fecha))}, ${escaparHtml(cita.hora)} ${insigniaEstado(cita.estado)}</dd></div>
            <div><dt>Motivo</dt><dd>${escaparHtml(cita.motivo || 'Sin motivo registrado')}</dd></div>
            <div><dt>Alergias</dt><dd>${escaparHtml(paciente.alergias)}</dd></div>
          </dl>
        </section>
        <section class="panel">
          <h2 class="panel__titulo">Historial clínico previo</h2>
          ${renderizarHistorial(paciente.id)}
        </section>
      </aside>
    </div>`;
}

function renderizarResumenDelRegistro(borrador) {
  const filas = obtenerTratamientosValidos(borrador);
  return `
    <dl class="lista-datos lista-datos--apilada resumen-registro">
      <div><dt>Diagnóstico</dt><dd>${escaparHtml(borrador.diagnostico)} ${renderizarCodigoCie10(borrador.codigoCie10)}</dd></div>
      <div><dt>Tratamiento</dt><dd>
        <ul class="resumen-registro__lista">
          ${filas.map((fila) => `<li><b>${escaparHtml(fila.tratamiento)}</b>${fila.indicaciones ? ` · ${escaparHtml(fila.indicaciones)}` : ''}</li>`).join('')}
        </ul>
      </dd></div>
      ${borrador.observaciones ? `<div><dt>Observaciones</dt><dd>${escaparHtml(borrador.observaciones)}</dd></div>` : ''}
    </dl>`;
}

function renderizarPasoConfirmacion({ resultado }) {
  const { registro, cita } = resultado;
  return `
    <section class="panel exito-reserva">
      <span class="exito-reserva__anillo"><span>${icono('check')}</span></span>
      <h2 class="exito-reserva__titulo" data-titulo-paso tabindex="-1">Diagnóstico registrado</h2>
      <div class="ticket">
        <div class="ticket__fila">${icono('usuario')}<span>Paciente</span><b>${escaparHtml(cita.paciente.nombre)}</b></div>
        <div class="ticket__fila">${icono('diagnostico')}<span>Diagnóstico</span><b>${escaparHtml(registro.diagnostico)} ${renderizarCodigoCie10(registro.codigoCie10)}</b></div>
        <div class="ticket__fila">${icono('info')}<span>Estado</span><b>${insigniaEstado(ESTADOS_CITA.ATENDIDA)}</b></div>
      </div>
      <div class="exito-reserva__acciones">
        <button class="boton boton--primario" type="button" data-accion="enviar-diagnostico">${icono('campana')}Enviar diagnóstico a paciente</button>
        <button class="boton boton--secundario" type="button" data-accion="registrar-receta">${icono('documento')}Registrar receta médica</button>
        <a class="boton boton--secundario" href="${construirHash('inicio')}">Volver al inicio</a>
      </div>
    </section>`;
}

export default {
  id: ID_MODULO,
  titulo: 'Diagnóstico',
  icono: 'diagnostico',
  roles: ['medico'],
  seccion: 'Atención médica',
  menu: false,
  montar(contenedor, { usuario, params, navegar }) {
    const citaSolicitada = params.cita ? obtenerCitaDetallada(params.cita) : null;
    const citaValida = esCitaAtendible(citaSolicitada, usuario.id);
    const estado = {
      paso: citaValida ? PASO_REGISTRO : PASO_SELECCION,
      citaId: citaValida ? params.cita : null,
      borrador: crearBorradorInicial(),
      errores: {},
      resultado: null,
      avisoSeleccion: params.cita && !citaValida ? 'La cita elegida no está disponible para registrar un diagnóstico.' : '',
    };
    const autocompletado = { sugerencias: [], activa: -1 };

    function renderizar() {
      const contenidoPorPaso = {
        [PASO_SELECCION]: () => renderizarPasoSeleccion(estado, usuario.id),
        [PASO_REGISTRO]: () => renderizarPasoRegistro(estado),
        [PASO_CONFIRMACION]: () => renderizarPasoConfirmacion(estado),
      };
      contenedor.innerHTML = `
        ${renderizarEncabezado({ titulo: 'Diagnóstico' })}
        ${renderizarStepper(PASOS, estado.paso)}
        ${contenidoPorPaso[estado.paso]()}`;
    }

    function leerBorrador() {
      const formulario = contenedor.querySelector('#formularioDiagnostico');
      return {
        diagnostico: formulario.elements.diagnostico.value.trim(),
        codigoCie10: formulario.elements.codigoCie10.value,
        tratamientos: [...formulario.querySelectorAll('[data-fila-tratamiento]')].map((fila) => ({
          tratamiento: fila.querySelector('[data-campo-tratamiento]').value.trim(),
          indicaciones: fila.querySelector('[data-campo-indicaciones]').value.trim(),
        })),
        observaciones: formulario.elements.observaciones.value.trim(),
      };
    }

    function pintarSugerencias() {
      const lista = contenedor.querySelector('#sugerenciasDiagnostico');
      const campo = contenedor.querySelector('#campo-diagnostico');
      if (!lista || !campo) return;
      lista.innerHTML = renderizarSugerencias(autocompletado.sugerencias, autocompletado.activa);
      lista.hidden = autocompletado.sugerencias.length === 0;
      campo.setAttribute('aria-expanded', String(!lista.hidden));
      if (autocompletado.activa >= 0) campo.setAttribute('aria-activedescendant', `sugerencia-${autocompletado.activa}`);
      else campo.removeAttribute('aria-activedescendant');
    }

    function cerrarSugerencias() {
      Object.assign(autocompletado, { sugerencias: [], activa: -1 });
      pintarSugerencias();
    }

    function elegirSugerencia(indice) {
      const entrada = autocompletado.sugerencias[indice];
      if (!entrada) return;
      contenedor.querySelector('#campo-diagnostico').value = entrada.nombre;
      contenedor.querySelector('#campo-codigoCie10').value = entrada.codigo;
      cerrarSugerencias();
    }

    function moverSugerencia(desplazamiento) {
      const total = autocompletado.sugerencias.length;
      if (!total) return;
      autocompletado.activa = (autocompletado.activa + desplazamiento + total) % total;
      pintarSugerencias();
    }

    function manejarTeclado(evento) {
      if (evento.target.id !== 'campo-diagnostico') return;
      if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
        evento.preventDefault();
        moverSugerencia(evento.key === 'ArrowDown' ? 1 : -1);
      } else if (evento.key === 'Enter' && autocompletado.activa >= 0) {
        evento.preventDefault();
        elegirSugerencia(autocompletado.activa);
      } else if (evento.key === 'Escape' && autocompletado.sugerencias.length) {
        evento.stopPropagation();
        cerrarSugerencias();
      }
    }

    function modificarTratamientos(modificar, enfocar) {
      estado.borrador = leerBorrador();
      modificar(estado.borrador.tratamientos);
      renderizar();
      contenedor.querySelectorAll(enfocar)[Math.max(0, estado.borrador.tratamientos.length - 1)]?.focus();
    }

    async function registrarDiagnostico() {
      estado.borrador = leerBorrador();
      estado.errores = validarBorrador(estado.borrador);
      const [primerError] = Object.keys(estado.errores);
      if (primerError) {
        renderizar();
        contenedor.querySelector(primerError === 'diagnostico' ? '#campo-diagnostico' : '[data-campo-tratamiento]')?.focus();
        return;
      }

      const confirmado = await confirmarAccion({
        titulo: 'Confirmar registro del diagnóstico',
        mensaje: 'Al confirmar, la cita pasará a estado Atendida y el paciente recibirá una notificación.',
        detalle: renderizarResumenDelRegistro(estado.borrador),
        textoConfirmar: 'Confirmar registro',
        textoCancelar: 'Regresar',
      });
      if (!confirmado) return;

      try {
        estado.resultado = registrarAtencion({ citaId: estado.citaId, medicoId: usuario.id, borrador: estado.borrador });
        estado.paso = PASO_CONFIRMACION;
        renderizar();
        contenedor.querySelector('[data-titulo-paso]')?.focus();
        mostrarToast('Diagnóstico registrado correctamente.');
      } catch (error) {
        if (!(error instanceof ErrorDeDominio)) throw error;
        mostrarToast(error.message, 'error');
        navegar(ID_MODULO);
      }
    }

    const mensajesExternos = {
      'enviar-diagnostico': 'Enviar diagnóstico a paciente pertenece a otro caso de uso, aún no integrado en este módulo.',
      'registrar-receta': 'Registrar receta médica pertenece a otro caso de uso, aún no integrado en este módulo.',
    };

    contenedor.addEventListener('click', (evento) => {
      const opcion = evento.target.closest('.autocompletar__opcion');
      if (opcion) return;
      const boton = evento.target.closest('[data-accion]');
      if (!boton || boton.disabled) return;
      if (mensajesExternos[boton.dataset.accion]) mostrarToast(mensajesExternos[boton.dataset.accion], 'info');
      if (boton.dataset.accion === 'agregar-tratamiento') {
        modificarTratamientos((filas) => filas.push(crearTratamientoVacio()), '[data-campo-tratamiento]');
      }
      if (boton.dataset.accion === 'quitar-tratamiento') {
        modificarTratamientos((filas) => filas.splice(Number(boton.dataset.indice), 1), '[data-campo-tratamiento]');
      }
    });

    contenedor.addEventListener('mousedown', (evento) => {
      const opcion = evento.target.closest('.autocompletar__opcion');
      if (!opcion) return;
      evento.preventDefault();
      elegirSugerencia(Number(opcion.dataset.indice));
    });

    contenedor.addEventListener('input', (evento) => {
      if (evento.target.id !== 'campo-diagnostico') return;
      contenedor.querySelector('#campo-codigoCie10').value = '';
      autocompletado.sugerencias = buscarSugerencias(evento.target.value);
      autocompletado.activa = -1;
      pintarSugerencias();
    });

    contenedor.addEventListener('keydown', manejarTeclado);
    contenedor.addEventListener('focusout', (evento) => {
      if (evento.target.id === 'campo-diagnostico') setTimeout(cerrarSugerencias, 120);
    });

    contenedor.addEventListener('submit', (evento) => {
      evento.preventDefault();
      registrarDiagnostico();
    });

    renderizar();
    return storage.suscribir(() => {
      if (estado.paso === PASO_SELECCION) renderizar();
    });
  },
};
