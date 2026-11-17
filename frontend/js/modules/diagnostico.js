import * as storage from '../core/storage.js';
import {
  ESTADOS_CITA,
  ErrorDeDominio,
  listarCitas,
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
  renderizarEncabezado,
  renderizarListaCitas,
  renderizarStepper,
  renderizarVacio,
} from '../core/ui.js';

const ID_MODULO = 'diagnostico';
const PASOS = ['Identificar cita', 'Diagnóstico', 'Confirmación'];
const PASO_SELECCION = 0;
const PASO_REGISTRO = 1;
const PASO_CONFIRMACION = 2;
const LIMITE_HISTORIAL = 5;
const LONGITUD_MINIMA_TEXTO = 10;

const CATALOGO_CIE10 = [
  { codigo: 'I10', nombre: 'Hipertensión arterial esencial' },
  { codigo: 'J00', nombre: 'Rinofaringitis aguda' },
  { codigo: 'J02.9', nombre: 'Faringitis aguda, no especificada' },
  { codigo: 'J03.9', nombre: 'Faringoamigdalitis aguda' },
  { codigo: 'K29.7', nombre: 'Gastritis, no especificada' },
  { codigo: 'M54.5', nombre: 'Dolor lumbar' },
  { codigo: 'R07.4', nombre: 'Dolor torácico no especificado' },
  { codigo: 'R51', nombre: 'Cefalea' },
  { codigo: 'R53', nombre: 'Malestar y fatiga' },
  { codigo: 'Z00.0', nombre: 'Examen médico general' },
];

const CAMPOS_DEL_FORMULARIO = ['codigoCie10', 'tratamiento', 'indicaciones', 'observaciones'];

function esCitaAtendible(cita, medicoId) {
  return Boolean(cita) && cita.medicoId === medicoId && puedeRegistrarDiagnostico(cita);
}

function listarCitasPorAtender(medicoId) {
  return listarCitas((cita) => cita.medicoId === medicoId).filter((cita) => esCitaAtendible(cita, medicoId));
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

function validarBorrador(borrador) {
  const errores = {};
  if (!CATALOGO_CIE10.some((entrada) => entrada.codigo === borrador.codigoCie10)) errores.codigoCie10 = 'Selecciona un diagnóstico.';
  if (borrador.tratamiento.length < LONGITUD_MINIMA_TEXTO) errores.tratamiento = `Describe el tratamiento (mínimo ${LONGITUD_MINIMA_TEXTO} caracteres).`;
  if (borrador.indicaciones.length < LONGITUD_MINIMA_TEXTO) errores.indicaciones = `Describe las indicaciones (mínimo ${LONGITUD_MINIMA_TEXTO} caracteres).`;
  return errores;
}

function registrarAtencion({ citaId, medicoId, borrador }) {
  return storage.ejecutarTransaccion(() => {
    const cita = obtenerCitaDetallada(citaId);
    if (!esCitaAtendible(cita, medicoId)) {
      throw new ErrorDeDominio('La cita ya no está disponible para registrar un diagnóstico.', 'cita-no-atendible');
    }
    const medico = obtenerMedico(medicoId);
    const entrada = CATALOGO_CIE10.find((item) => item.codigo === borrador.codigoCie10);
    const registradoEn = ahoraISO();

    const registro = storage.insertar('historialClinico', {
      pacienteId: cita.pacienteId,
      medicoId,
      citaId,
      fecha: cita.fecha,
      diagnostico: entrada.nombre,
      codigoCie10: entrada.codigo,
      tratamiento: borrador.tratamiento,
      indicaciones: borrador.indicaciones,
      observaciones: borrador.observaciones || 'Sin observaciones.',
      registradoEn,
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
  const aviso = estado.avisoSeleccion
    ? renderizarAviso({ tipo: 'alerta', mensaje: estado.avisoSeleccion })
    : '';
  if (!citas.length) {
    return `<section class="panel">${aviso}${renderizarVacio({ iconoVacio: 'diagnostico', titulo: 'No tienes citas por atender' })}</section>`;
  }
  return `
    <section class="panel">
      <h2 class="panel__titulo">Citas por atender</h2>
      ${aviso}
      ${renderizarListaCitas(citas, {
    mostrar: 'paciente',
    crearEnlace: (cita) => construirHash(ID_MODULO, { cita: cita.id }),
  })}
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
          <strong>${escaparHtml(registro.diagnostico)} <span class="codigo">${escaparHtml(registro.codigoCie10)}</span></strong>
        </li>`).join('')}
    </ul>`;
}

function renderizarCampoTexto({ nombre, etiqueta, valor, errores, requerido = true }) {
  return `
    <div class="campo">
      <label class="campo__etiqueta" for="campo-${nombre}">${escaparHtml(etiqueta)}${requerido ? '' : ' <span class="campo__opcional">(opcional)</span>'}</label>
      <textarea class="entrada" id="campo-${nombre}" name="${nombre}" rows="3"${errores[nombre] ? ' aria-invalid="true"' : ''}>${escaparHtml(valor)}</textarea>
      ${errores[nombre] ? `<p class="campo__error" role="alert">${escaparHtml(errores[nombre])}</p>` : ''}
    </div>`;
}

function renderizarPasoRegistro(estado) {
  const cita = obtenerCitaDetallada(estado.citaId);
  const { paciente } = cita;
  const { borrador, errores } = estado;
  return `
    <div class="diagnostico">
      <form class="panel diagnostico__formulario" id="formularioDiagnostico" novalidate>
        <h2 class="panel__titulo">Diagnóstico</h2>
        <div class="campo">
          <label class="campo__etiqueta" for="campo-codigoCie10">Diagnóstico principal (CIE-10)</label>
          <select class="entrada" id="campo-codigoCie10" name="codigoCie10"${errores.codigoCie10 ? ' aria-invalid="true"' : ''}>
            <option value="">Selecciona un diagnóstico</option>
            ${CATALOGO_CIE10.map((entrada) => `<option value="${escaparHtml(entrada.codigo)}"${borrador.codigoCie10 === entrada.codigo ? ' selected' : ''}>${escaparHtml(`${entrada.codigo} – ${entrada.nombre}`)}</option>`).join('')}
          </select>
          ${errores.codigoCie10 ? `<p class="campo__error" role="alert">${escaparHtml(errores.codigoCie10)}</p>` : ''}
        </div>
        ${renderizarCampoTexto({ nombre: 'tratamiento', etiqueta: 'Tratamiento indicado', valor: borrador.tratamiento, errores })}
        ${renderizarCampoTexto({ nombre: 'indicaciones', etiqueta: 'Indicaciones', valor: borrador.indicaciones, errores })}
        ${renderizarCampoTexto({ nombre: 'observaciones', etiqueta: 'Observaciones', valor: borrador.observaciones, errores, requerido: false })}
        <div class="acciones-paso">
          <a class="boton boton--secundario" href="${construirHash(ID_MODULO)}">${icono('flechaIzquierda')}Cambiar cita</a>
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

function renderizarPasoConfirmacion({ resultado }) {
  const { registro, cita } = resultado;
  return `
    <section class="panel exito-reserva">
      <span class="exito-reserva__anillo"><span>${icono('check')}</span></span>
      <h2 class="exito-reserva__titulo" data-titulo-paso tabindex="-1">Diagnóstico registrado</h2>
      <div class="ticket">
        <div class="ticket__fila">${icono('usuario')}<span>Paciente</span><b>${escaparHtml(cita.paciente.nombre)}</b></div>
        <div class="ticket__fila">${icono('diagnostico')}<span>Diagnóstico</span><b>${escaparHtml(registro.diagnostico)} <span class="codigo">${escaparHtml(registro.codigoCie10)}</span></b></div>
        <div class="ticket__fila">${icono('info')}<span>Estado</span><b>${insigniaEstado(ESTADOS_CITA.ATENDIDA)}</b></div>
      </div>
      <div class="exito-reserva__acciones">
        <button class="boton boton--primario" type="button" data-accion="enviar-diagnostico">${icono('campana')}Enviar diagnóstico a paciente</button>
        <button class="boton boton--secundario" type="button" data-accion="registrar-receta">${icono('documento')}Registrar receta médica</button>
        <a class="boton boton--secundario" href="${construirHash('detalle-cita', { id: cita.id })}">Volver al detalle de cita</a>
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
      borrador: Object.fromEntries(CAMPOS_DEL_FORMULARIO.map((campo) => [campo, ''])),
      errores: {},
      resultado: null,
      avisoSeleccion: params.cita && !citaValida ? 'La cita elegida no está disponible para registrar un diagnóstico.' : '',
    };

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

    function leerBorrador(formulario) {
      return Object.fromEntries(CAMPOS_DEL_FORMULARIO.map((campo) => [campo, formulario.elements.namedItem(campo).value.trim()]));
    }

    async function guardarDiagnostico(formulario) {
      estado.borrador = leerBorrador(formulario);
      estado.errores = validarBorrador(estado.borrador);
      const [primerCampo] = Object.keys(estado.errores);
      if (primerCampo) {
        renderizar();
        contenedor.querySelector(`#campo-${primerCampo}`)?.focus();
        return;
      }

      const confirmado = await confirmarAccion({
        titulo: 'Registrar diagnóstico',
        mensaje: 'La cita pasará a estado Atendida y el paciente recibirá una notificación. ¿Deseas continuar?',
        textoConfirmar: 'Registrar diagnóstico',
      });
      if (!confirmado) return;

      try {
        estado.resultado = registrarAtencion({ citaId: estado.citaId, medicoId: usuario.id, borrador: estado.borrador });
        estado.paso = PASO_CONFIRMACION;
        renderizar();
        contenedor.querySelector('[data-titulo-paso]')?.focus();
      } catch (error) {
        if (!(error instanceof ErrorDeDominio)) throw error;
        mostrarToast(error.message, 'error');
        navegar(ID_MODULO);
      }
    }

    contenedor.addEventListener('click', (evento) => {
      const boton = evento.target.closest('[data-accion]');
      const mensajes = {
        'enviar-diagnostico': 'Enviar diagnóstico a paciente pertenece a otro caso de uso, aún no integrado en este módulo.',
        'registrar-receta': 'Registrar receta médica pertenece a otro caso de uso, aún no integrado en este módulo.',
      };
      if (boton && mensajes[boton.dataset.accion]) mostrarToast(mensajes[boton.dataset.accion], 'info');
    });

    contenedor.addEventListener('submit', (evento) => {
      evento.preventDefault();
      guardarDiagnostico(evento.target);
    });

    renderizar();
    return storage.suscribir(() => {
      if (estado.paso === PASO_SELECCION) renderizar();
    });
  },
};
