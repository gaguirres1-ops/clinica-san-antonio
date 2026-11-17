import * as storage from './storage.js';
import { ESTADOS_CITA, esCitaActiva, esCitaFutura, obtenerCitaDetallada, puedeCancelarCita, puedeRegistrarDiagnostico, puedeReprogramarCita, puedeVerCita } from './dominio.js';
import { desdeISO, formatearFecha, formatearFechaLarga, formatearMomento } from './fechas.js';
import { construirHash, puedeAcceder } from './navigation.js';
import {
  escaparHtml,
  formatearMoneda,
  icono,
  insigniaEstado,
  renderizarAviso,
  renderizarCodigoCie10,
  renderizarAvatarMedico,
  renderizarEncabezado,
  renderizarVacio,
} from './ui.js';

const ACCIONES_DISPONIBLES = [
  {
    ruta: 'reprogramar-cita', texto: 'Reprogramar cita', iconoAccion: 'reprogramar', variante: 'secundario',
    aplica: puedeReprogramarCita,
    regla: 'Reprogramación: solo una vez. La nueva fecha debe ser posterior a la fecha actual de la cita.',
  },
  {
    ruta: 'reasignar-medico', texto: 'Reasignar médico', iconoAccion: 'reasignar', variante: 'secundario',
    aplica: (cita) => esCitaActiva(cita) && esCitaFutura(cita),
  },
  {
    ruta: 'diagnostico', texto: 'Diagnóstico', iconoAccion: 'diagnostico', variante: 'primario',
    aplica: puedeRegistrarDiagnostico,
  },
  {
    ruta: 'cancelar-cita', texto: 'Cancelar cita', iconoAccion: 'cancelar', variante: 'peligro-suave',
    aplica: puedeCancelarCita,
    regla: 'Cancelación: disponible antes de la atención. El reembolso depende del pago y de las 24 horas previas.',
  },
];

function renderizarFila(iconoFila, etiqueta, valor) {
  return `
    <div class="ficha__fila">
      ${icono(iconoFila)}
      <span class="ficha__etiqueta">${escaparHtml(etiqueta)}</span>
      <span class="ficha__valor">${valor}</span>
    </div>`;
}

function renderizarPago(pago) {
  if (!pago) return renderizarVacio({ iconoVacio: 'dinero', titulo: 'Sin registro de pago' });
  const fechaReferencia = pago.fechaPago
    ? `Pagado el ${formatearMomento(pago.fechaPago)}`
    : `Fecha límite: ${formatearMomento(pago.fechaLimite)}`;
  return `
    <dl class="lista-datos">
      <div><dt>Monto</dt><dd class="lista-datos__monto">${formatearMoneda(pago.monto)}</dd></div>
      <div><dt>Estado</dt><dd>${insigniaEstado(pago.estado)}</dd></div>
      <div><dt>Método</dt><dd>${escaparHtml(pago.metodo ?? 'Por definir')}</dd></div>
      <div><dt>Referencia</dt><dd>${escaparHtml(fechaReferencia)}</dd></div>
    </dl>`;
}

function renderizarTratamientos(diagnostico) {
  if (!diagnostico.tratamientos?.length) {
    return `
        <div><dt>Tratamiento</dt><dd>${escaparHtml(diagnostico.tratamiento)}</dd></div>
        <div><dt>Indicaciones</dt><dd>${escaparHtml(diagnostico.indicaciones)}</dd></div>`;
  }
  return `
        <div><dt>Tratamiento</dt><dd>
          <ul class="lista-tratamientos">
            <li class="lista-tratamientos__cabecera"><span>Tratamiento</span><span>Indicaciones</span></li>
            ${diagnostico.tratamientos.map((fila) => `<li><b>${escaparHtml(fila.tratamiento)}</b><span>${escaparHtml(fila.indicaciones || '—')}</span></li>`).join('')}
          </ul>
        </dd></div>`;
}

function renderizarDiagnostico(diagnostico) {
  if (!diagnostico) return '';
  return `
    <section class="panel">
      <header class="panel__cabecera"><h2 class="panel__titulo">Diagnóstico registrado</h2></header>
      <dl class="lista-datos lista-datos--apilada">
        <div><dt>Diagnóstico</dt><dd>${escaparHtml(diagnostico.diagnostico)} ${renderizarCodigoCie10(diagnostico.codigoCie10)}</dd></div>
        ${renderizarTratamientos(diagnostico)}
        <div><dt>Observaciones</dt><dd>${escaparHtml(diagnostico.observaciones)}</dd></div>
      </dl>
    </section>`;
}

function renderizarLineaDeTiempo(eventos) {
  const ordenados = [...eventos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return `
    <ol class="linea-tiempo">
      ${ordenados.map((evento) => `
        <li class="linea-tiempo__evento">
          <time datetime="${escaparHtml(evento.fecha)}">${escaparHtml(formatearMomento(evento.fecha))}</time>
          <p>${escaparHtml(evento.descripcion)}</p>
          <small>${escaparHtml(evento.actor)}</small>
        </li>`).join('')}
    </ol>`;
}

function renderizarAccion(cita, accion) {
  const contenido = `${icono(accion.iconoAccion)}${escaparHtml(accion.texto)}`;
  const boton = accion.aplica(cita)
    ? `<a class="boton boton--${accion.variante} boton--bloque" href="${construirHash(accion.ruta, { cita: cita.id })}">${contenido}</a>`
    : `<button class="boton boton--${accion.variante} boton--bloque" type="button" disabled>${contenido}</button>`;
  return `${boton}${accion.regla ? `<p class="acciones-detalle__regla">${escaparHtml(accion.regla)}</p>` : ''}`;
}

function renderizarAcciones(cita, rol) {
  const acciones = ACCIONES_DISPONIBLES.filter((accion) => puedeAcceder(accion.ruta, rol) && (accion.regla || accion.aplica(cita)));
  if (!acciones.length) return '';
  return `
    <section class="panel">
      <header class="panel__cabecera"><h2 class="panel__titulo">Acciones</h2></header>
      <div class="acciones-detalle">
        ${acciones.map((accion) => renderizarAccion(cita, accion)).join('')}
      </div>
    </section>`;
}

function calcularEdad(fechaNacimiento) {
  const nacimiento = desdeISO(fechaNacimiento);
  const hoy = new Date();
  const cumplioAnio = hoy.getMonth() > nacimiento.getMonth()
    || (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() >= nacimiento.getDate());
  return hoy.getFullYear() - nacimiento.getFullYear() - (cumplioAnio ? 0 : 1);
}

function renderizarInformacionDelPaciente(cita) {
  const { paciente } = cita;
  if (!paciente) return '';
  const historial = storage
    .filtrar('historialClinico', (registro) => registro.pacienteId === paciente.id && registro.citaId !== cita.id)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 5);
  return `
    <section class="panel">
      <header class="panel__cabecera"><h2 class="panel__titulo">Información del paciente</h2></header>
      <dl class="lista-datos lista-datos--apilada">
        <div><dt>Paciente</dt><dd>${escaparHtml(paciente.nombre)}</dd></div>
        <div><dt>Edad y sexo</dt><dd>${calcularEdad(paciente.fechaNacimiento)} años · ${paciente.sexo === 'F' ? 'Femenino' : 'Masculino'}</dd></div>
        <div><dt>Teléfono</dt><dd>${escaparHtml(paciente.telefono)}</dd></div>
        <div><dt>Seguro</dt><dd>${escaparHtml(paciente.seguro)}</dd></div>
        <div><dt>Alergias</dt><dd>${escaparHtml(paciente.alergias)}</dd></div>
      </dl>
      <h3 class="subtitulo subtitulo--separado">Historial clínico previo</h3>
      ${historial.length ? `
        <ul class="diagnostico__historial">
          ${historial.map((registro) => `
            <li>
              <time datetime="${escaparHtml(registro.fecha)}">${escaparHtml(formatearFecha(registro.fecha))}</time>
              <strong>${escaparHtml(registro.diagnostico)} ${renderizarCodigoCie10(registro.codigoCie10)}</strong>
            </li>`).join('')}
        </ul>` : '<p class="diagnostico__sin-historial">Sin diagnósticos previos registrados.</p>'}
    </section>`;
}

function renderizarDetalle(cita, rol) {
  const avisoPago = cita.estado === ESTADOS_CITA.PENDIENTE_PAGO && cita.pago
    ? renderizarAviso({ tipo: 'alerta', titulo: 'Pago pendiente', mensaje: `Completa el pago antes del ${formatearMomento(cita.pago.fechaLimite)} para confirmar la cita; de lo contrario, el horario será liberado.` })
    : '';

  return `
    ${renderizarEncabezado({ titulo: `Cita ${cita.id}`, descripcion: `Registrada el ${formatearMomento(cita.creadaEn)}` })}
    <div class="detalle-cita">
      <div class="detalle-cita__principal">
        <section class="ficha">
          <header class="ficha__cabecera">
            <div>
              <span>Código de cita</span>
              <b>${escaparHtml(cita.id)}</b>
            </div>
            ${insigniaEstado(cita.estado)}
          </header>
          <div class="ficha__medico">
            ${renderizarAvatarMedico(cita.medico, 'grande')}
            <div>
              <p class="ficha__especialidad">${escaparHtml(cita.medico?.especialidad?.nombre ?? '')}</p>
              <h2>${escaparHtml(cita.medico?.nombre ?? 'Médico no disponible')}</h2>
              <p class="ficha__cmp">CMP ${escaparHtml(cita.medico?.cmp ?? '—')}</p>
            </div>
          </div>
          ${renderizarFila('calendario', 'Fecha', escaparHtml(formatearFechaLarga(cita.fecha)))}
          ${renderizarFila('reloj', 'Hora', escaparHtml(cita.hora))}
          ${renderizarFila('ubicacion', 'Lugar', escaparHtml(cita.consultorio))}
          ${renderizarFila('usuario', 'Paciente', `${escaparHtml(cita.paciente?.nombre ?? '')} <small>DNI ${escaparHtml(cita.paciente?.dni ?? '')}</small>`)}
          ${renderizarFila('documento', 'Motivo', escaparHtml(cita.motivo || 'Sin motivo registrado'))}
        </section>
        ${avisoPago}
        ${rol === 'medico' ? renderizarInformacionDelPaciente(cita) : ''}
        ${renderizarDiagnostico(cita.diagnostico)}
      </div>
      <aside class="detalle-cita__lateral">
        ${renderizarAcciones(cita, rol)}
        <section class="panel">
          <header class="panel__cabecera"><h2 class="panel__titulo">Pago</h2></header>
          ${renderizarPago(cita.pago)}
        </section>
        <section class="panel">
          <header class="panel__cabecera"><h2 class="panel__titulo">Historial de la cita</h2></header>
          ${renderizarLineaDeTiempo(cita.eventos)}
        </section>
      </aside>
    </div>`;
}

function renderizarNoDisponible(titulo, mensaje) {
  return `
    ${renderizarEncabezado({ titulo: 'Detalle de cita' })}
    <section class="panel">
      ${renderizarVacio({
        iconoVacio: 'candado',
        titulo,
        mensaje,
        accion: `<a class="boton boton--secundario" href="${construirHash('inicio')}">${icono('flechaIzquierda')}Volver al inicio</a>`,
      })}
    </section>`;
}

export default {
  id: 'detalle-cita',
  titulo: 'Detalle de cita',
  icono: 'documento',
  roles: ['paciente', 'medico', 'administrador'],
  menu: false,
  montar(contenedor, { params, rol, sesion }) {
    const renderizar = () => {
      const cita = params.id ? obtenerCitaDetallada(params.id) : null;
      if (!cita) {
        contenedor.innerHTML = renderizarNoDisponible('Cita no encontrada', `No existe una cita con el código ${params.id ?? ''}.`);
        return;
      }
      if (!puedeVerCita(cita, sesion)) {
        contenedor.innerHTML = renderizarNoDisponible('Sin acceso a esta cita', `La cita del ${formatearFecha(cita.fecha)} no pertenece al perfil activo.`);
        return;
      }
      contenedor.innerHTML = renderizarDetalle(cita, rol);
    };
    renderizar();
    return storage.suscribir(renderizar);
  },
};
