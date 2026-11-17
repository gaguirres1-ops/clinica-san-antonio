import * as storage from '../core/storage.js';
import {
  ESTADOS_CITA,
  ESTADOS_HORARIO,
  ESTADOS_PAGO,
  ErrorDeDominio,
  HORAS_LIMITE_PAGO,
  disponibilidadPorFecha,
  esCitaActiva,
  esHorarioReservable,
  horariosDelMedico,
  listarEspecialidades,
  listarMedicos,
  normalizarTexto,
  notificar,
  obtenerMedico,
  obtenerPaciente,
  ocuparHorario,
  proximaFechaDisponible,
} from '../core/dominio.js';
import {
  aISO,
  aMinutos,
  ahoraISO,
  combinarFechaHora,
  desdeISO,
  formatearFecha,
  formatearFechaLarga,
  formatearMesAnio,
  formatearMomento,
  hoyISO,
  sumarMinutos,
} from '../core/fechas.js';
import { construirHash } from '../core/navigation.js';
import {
  escaparHtml,
  formatearMoneda,
  icono,
  insigniaEstado,
  mostrarToast,
  renderizarAviso,
  renderizarAvatarMedico,
  renderizarEncabezado,
  renderizarStepper,
  renderizarVacio,
} from '../core/ui.js';

const PASOS = ['Médico', 'Fecha y horario', 'Pago', 'Confirmación'];
const TITULOS_DE_PASO = ['Selecciona un médico', 'Selecciona fecha y horario', 'Realiza el pago'];
const SUBTITULOS_DE_PASO = [
  'Busca por nombre o filtra por especialidad y elige con quién deseas atenderte.',
  'Elige un día con horarios libres y luego el horario de tu preferencia.',
  'Elige un método de pago. Si prefieres, puedes pagar después, dentro del plazo.',
];
const PASO_MEDICO = 0;
const PASO_FECHA_Y_HORARIO = 1;
const PASO_PAGO = 2;
const PASO_EXITO = 3;
const METODOS_DE_PAGO = [
  { id: 'tarjeta', etiqueta: 'Tarjeta de crédito / débito', marcas: ['VISA', 'MC'] },
  { id: 'yape', etiqueta: 'Yape', marcas: [] },
  { id: 'plin', etiqueta: 'Plin', marcas: [] },
];
const CAMPOS_POR_METODO = {
  tarjeta: [
    { campo: 'numero', etiqueta: 'Número de tarjeta', placeholder: '0000 0000 0000 0000', longitud: 23, completo: true },
    { campo: 'titular', etiqueta: 'Nombre del titular', placeholder: 'Como aparece en la tarjeta', teclado: 'text', longitud: 60, completo: true },
    { campo: 'vencimiento', etiqueta: 'Vencimiento', placeholder: 'MM/AA', longitud: 5 },
    { campo: 'cvv', etiqueta: 'CVV', placeholder: '123', longitud: 4 },
  ],
  yape: [
    { campo: 'celular', etiqueta: 'Celular Yape', placeholder: '9XX XXX XXX', longitud: 11 },
    { campo: 'codigo', etiqueta: 'Código de aprobación', placeholder: '6 dígitos', longitud: 6 },
  ],
  plin: [
    { campo: 'celular', etiqueta: 'Celular Plin', placeholder: '9XX XXX XXX', longitud: 11 },
    { campo: 'codigo', etiqueta: 'Código de aprobación', placeholder: '6 dígitos', longitud: 6 },
  ],
};
const TERMINACION_DE_TARJETA_RECHAZADA = '0002';
const DIAS_DE_LA_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const LIMITE_MOTIVO = 250;
const MINUTOS_MINIMOS_PARA_PAGAR = 30;
const MINUTOS_ANTES_DE_LA_CITA = 60;
const INICIO_TURNO_TARDE = aMinutos('13:00');
const DEMORA_DE_CONFIRMACION_MS = 500;

function crearEstadoInicial() {
  return {
    paso: PASO_MEDICO,
    busqueda: '',
    especialidadId: 'todas',
    medicoId: null,
    fecha: null,
    mesVisible: null,
    horarioId: null,
    motivo: '',
    procesando: false,
    error: '',
    citaCreadaId: null,
    metodoPago: 'tarjeta',
    pago: {},
    erroresPago: {},
  };
}

function mesDeFecha(fechaIso) {
  const fecha = desdeISO(fechaIso ?? hoyISO());
  return { anio: fecha.getFullYear(), mes: fecha.getMonth() };
}

function compararMes(a, b) {
  return a.anio * 12 + a.mes - (b.anio * 12 + b.mes);
}

function calcularFechaLimitePago(fecha, hora) {
  const ahora = new Date();
  const limiteGeneral = sumarMinutos(ahora, HORAS_LIMITE_PAGO * 60);
  const limiteAntesDeLaCita = sumarMinutos(combinarFechaHora(fecha, hora), -MINUTOS_ANTES_DE_LA_CITA);
  const limiteMinimo = sumarMinutos(ahora, MINUTOS_MINIMOS_PARA_PAGAR);
  const limite = Math.max(limiteMinimo.getTime(), Math.min(limiteGeneral.getTime(), limiteAntesDeLaCita.getTime()));
  return new Date(limite).toISOString();
}

function generarTransaccion() {
  return `TX-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
}

function registrarReserva({ pacienteId, horarioId, motivo, metodoPago = null }) {
  return storage.ejecutarTransaccion(() => {
    const horario = storage.obtenerPorId('horarios', horarioId);
    if (!esHorarioReservable(horario)) {
      throw new ErrorDeDominio('El horario que elegiste acaba de ser reservado por otro paciente. Elige otro horario.', 'horario-no-disponible');
    }

    const medico = obtenerMedico(horario.medicoId);
    const paciente = obtenerPaciente(pacienteId);
    if (!medico?.activo) throw new ErrorDeDominio('El médico seleccionado ya no atiende citas.', 'medico-inactivo');

    const cruce = storage.buscar('citas', (cita) => cita.pacienteId === pacienteId
      && cita.fecha === horario.fecha
      && cita.hora === horario.hora
      && esCitaActiva(cita));
    if (cruce) {
      throw new ErrorDeDominio(`Ya tienes la cita ${cruce.id} el ${formatearFecha(horario.fecha)} a las ${horario.hora}.`, 'cruce-de-horario');
    }

    const registradaEn = ahoraISO();
    const pagado = Boolean(metodoPago);
    const etiquetaMetodo = METODOS_DE_PAGO.find((metodo) => metodo.id === metodoPago)?.etiqueta ?? null;
    const fechaLimite = calcularFechaLimitePago(horario.fecha, horario.hora);
    const cita = storage.insertar('citas', {
      pacienteId,
      medicoId: medico.id,
      especialidadId: medico.especialidadId,
      horarioId: horario.id,
      fecha: horario.fecha,
      hora: horario.hora,
      consultorio: medico.consultorio,
      motivo: motivo.trim(),
      estado: pagado ? ESTADOS_CITA.CONFIRMADA : ESTADOS_CITA.PENDIENTE_PAGO,
      creadaEn: registradaEn,
      eventos: [
        { fecha: registradaEn, descripcion: 'Cita registrada desde el portal del paciente.', actor: paciente.nombre },
        ...(pagado ? [{ fecha: registradaEn, descripcion: `Pago confirmado con ${etiquetaMetodo}. Estado: Confirmada.`, actor: 'Caja virtual' }] : []),
      ],
    });

    ocuparHorario(horario.id, cita.id);

    storage.insertar('pagos', {
      citaId: cita.id,
      pacienteId,
      monto: medico.tarifa,
      moneda: 'PEN',
      metodo: etiquetaMetodo,
      estado: pagado ? ESTADOS_PAGO.PAGADO : ESTADOS_PAGO.PENDIENTE,
      fechaLimite,
      fechaPago: pagado ? registradaEn : null,
      transaccion: pagado ? generarTransaccion() : null,
    });

    const cuando = `${formatearFechaLarga(horario.fecha)} a las ${horario.hora}`;
    notificar({
      destinatarioRol: 'paciente',
      destinatarioId: pacienteId,
      citaId: cita.id,
      titulo: pagado ? 'Cita confirmada' : 'Cita registrada · Pendiente de pago',
      mensaje: pagado
        ? `Tu pago fue aprobado y tu cita con ${medico.nombre} el ${cuando} quedó confirmada.`
        : `Tu cita con ${medico.nombre} el ${cuando} fue registrada. Realiza el pago antes del ${formatearMomento(fechaLimite)}.`,
    });
    notificar({
      destinatarioRol: 'medico',
      destinatarioId: medico.id,
      citaId: cita.id,
      titulo: 'Nueva cita agendada',
      mensaje: `${paciente.nombre} reservó una cita para el ${cuando}.`,
    });
    notificar({
      destinatarioRol: 'administrador',
      citaId: cita.id,
      titulo: pagado ? 'Nueva reserva confirmada' : 'Nueva reserva pendiente de pago',
      mensaje: `${cita.id} · ${paciente.nombre} con ${medico.nombre} (${medico.especialidad?.nombre ?? ''}).`,
    });

    return cita;
  });
}

function filtrarMedicos(medicos, { busqueda, especialidadId }) {
  const termino = normalizarTexto(busqueda);
  return medicos.filter((medico) => {
    const coincideEspecialidad = especialidadId === 'todas' || medico.especialidadId === especialidadId;
    const coincideTexto = !termino
      || normalizarTexto(medico.nombre).includes(termino)
      || normalizarTexto(medico.especialidad?.nombre).includes(termino);
    return coincideEspecialidad && coincideTexto;
  });
}

function renderizarTarjetaMedico(medico, seleccionado) {
  const hayDisponibilidad = Boolean(proximaFechaDisponible(medico.id));
  const accion = hayDisponibilidad
    ? `<button class="boton boton--suave boton--pequeno tarjeta-medico__consultar" type="button" data-accion="consultar-disponibilidad" data-id="${escaparHtml(medico.id)}">${icono('calendario')}Consultar disponibilidad</button>`
    : `<span class="tarjeta-medico__disponibilidad tarjeta-medico__disponibilidad--agotada">${icono('alerta')}Sin horarios disponibles</span>`;
  return `
    <article class="tarjeta-medico${seleccionado ? ' tarjeta-medico--seleccionada' : ''}">
      ${renderizarAvatarMedico(medico, 'grande')}
      <div class="tarjeta-medico__cuerpo">
        <span class="tarjeta-medico__especialidad">${escaparHtml(medico.especialidad?.nombre ?? '')}</span>
        <strong class="tarjeta-medico__nombre">${escaparHtml(medico.nombre)}</strong>
        <span class="tarjeta-medico__dato">CMP ${escaparHtml(medico.cmp)} · ${formatearMoneda(medico.tarifa)}</span>
        ${accion}
      </div>
    </article>`;
}

function renderizarListaMedicos(estado) {
  const medicos = filtrarMedicos(listarMedicos(), estado);
  if (!medicos.length) {
    return renderizarVacio({
      iconoVacio: 'buscar',
      titulo: 'No encontramos médicos con ese criterio',
      mensaje: 'Prueba con otro nombre o selecciona otra especialidad.',
    });
  }
  return medicos.map((medico) => renderizarTarjetaMedico(medico, medico.id === estado.medicoId)).join('');
}

function renderizarPasoMedico(estado) {
  const especialidades = [{ id: 'todas', nombre: 'Todas' }, ...listarEspecialidades()];
  return `
    <label class="buscador">
      <span class="solo-lector">Buscar médico o especialidad</span>
      ${icono('buscar')}
      <input class="entrada" type="search" data-campo="busqueda" placeholder="Buscar por nombre o especialidad" value="${escaparHtml(estado.busqueda)}" autocomplete="off">
    </label>
    <div class="pastillas" role="group" aria-label="Filtrar por especialidad">
      ${especialidades.map((especialidad) => `
        <button class="pastilla" type="button" data-accion="filtrar-especialidad" data-id="${escaparHtml(especialidad.id)}" aria-pressed="${especialidad.id === estado.especialidadId}">
          ${escaparHtml(especialidad.nombre)}
        </button>`).join('')}
    </div>
    <div class="rejilla-medicos" data-region="lista-medicos">${renderizarListaMedicos(estado)}</div>`;
}

function renderizarMedicoElegido(medico) {
  return `
    <div class="medico-elegido">
      ${renderizarAvatarMedico(medico, 'tarjeta')}
      <div class="medico-elegido__texto">
        <strong>${escaparHtml(medico.nombre)}</strong>
        <small>${escaparHtml(medico.especialidad?.nombre ?? '')} · ${escaparHtml(medico.consultorio)}</small>
      </div>
      <button class="boton boton--fantasma boton--pequeno" type="button" data-accion="ir-a-paso" data-paso="${PASO_MEDICO}">Cambiar</button>
    </div>`;
}

function renderizarCalendario(estado, disponibilidad) {
  const { anio, mes } = estado.mesVisible;
  const desfase = (new Date(anio, mes, 1).getDay() + 6) % 7;
  const diasDelMes = new Date(anio, mes + 1, 0).getDate();
  const hoy = hoyISO();
  const fechasConAgenda = [...disponibilidad.keys()];
  const mesMinimo = mesDeFecha(hoy);
  const mesMaximo = mesDeFecha(fechasConAgenda.at(-1) ?? hoy);

  const celdasVacias = Array.from({ length: desfase }, () => '<span class="calendario__hueco"></span>');
  const dias = Array.from({ length: diasDelMes }, (_, indice) => {
    const fecha = aISO(new Date(anio, mes, indice + 1));
    const libres = disponibilidad.get(fecha)?.libres ?? 0;
    const clases = ['calendario__dia', fecha === hoy && 'calendario__dia--hoy', libres > 0 && 'calendario__dia--libre'].filter(Boolean).join(' ');
    const descripcion = `${formatearFechaLarga(fecha)}, ${libres > 0 ? `${libres} horarios libres` : 'sin disponibilidad'}`;
    return `
      <button class="${clases}" type="button" data-accion="elegir-fecha" data-fecha="${fecha}"
        aria-pressed="${fecha === estado.fecha}" aria-label="${escaparHtml(descripcion)}" title="${escaparHtml(descripcion)}" ${libres > 0 ? '' : 'disabled'}>
        ${indice + 1}
      </button>`;
  });

  return `
    <div class="calendario">
      <div class="calendario__cabecera">
        <button class="calendario__navegar" type="button" data-accion="cambiar-mes" data-direccion="-1" aria-label="Mes anterior" ${compararMes(estado.mesVisible, mesMinimo) <= 0 ? 'disabled' : ''}>${icono('chevronIzquierda')}</button>
        <strong aria-live="polite">${escaparHtml(formatearMesAnio(anio, mes))}</strong>
        <button class="calendario__navegar" type="button" data-accion="cambiar-mes" data-direccion="1" aria-label="Mes siguiente" ${compararMes(estado.mesVisible, mesMaximo) >= 0 ? 'disabled' : ''}>${icono('chevronDerecha')}</button>
      </div>
      <div class="calendario__rejilla">
        ${DIAS_DE_LA_SEMANA.map((dia) => `<span class="calendario__dia-semana">${dia}</span>`).join('')}
        ${celdasVacias.join('')}${dias.join('')}
      </div>
      <p class="calendario__leyenda"><span class="calendario__punto"></span>Días con horarios libres</p>
    </div>`;
}

function renderizarFranja(horario, seleccionado) {
  const reservable = esHorarioReservable(horario);
  const motivoNoDisponible = horario.estado === ESTADOS_HORARIO.OCUPADO ? 'Ocupado' : horario.estado === ESTADOS_HORARIO.BLOQUEADO ? 'No disponible' : 'Hora pasada';
  return `
    <button class="franja${reservable ? '' : ' franja--no-disponible'}" type="button" data-accion="elegir-horario" data-id="${escaparHtml(horario.id)}"
      aria-pressed="${seleccionado}" ${reservable ? '' : 'disabled'} aria-label="${escaparHtml(`${horario.hora}, ${reservable ? 'disponible' : motivoNoDisponible.toLowerCase()}`)}">
      <span class="franja__hora">${escaparHtml(horario.hora)}</span>
      <small class="franja__estado">${reservable ? `${horario.duracionMinutos} min` : motivoNoDisponible}</small>
    </button>`;
}

function renderizarGrupoDeFranjas(titulo, iconoGrupo, horarios, estado) {
  if (!horarios.length) return '';
  const libres = horarios.filter(esHorarioReservable).length;
  return `
    <section class="grupo-franjas">
      <h3 class="grupo-franjas__titulo">${icono(iconoGrupo)}${escaparHtml(titulo)}<span>${libres} de ${horarios.length} libres</span></h3>
      <div class="grupo-franjas__lista">${horarios.map((horario) => renderizarFranja(horario, horario.id === estado.horarioId)).join('')}</div>
    </section>`;
}

function renderizarHorariosDelDia(estado, medico) {
  if (!estado.fecha) {
    return `<p class="agenda-reserva__sugerencia">${icono('calendario')}Elige una fecha para ver los horarios</p>`;
  }
  const horarios = horariosDelMedico(medico.id, estado.fecha);
  const manana = horarios.filter((horario) => aMinutos(horario.hora) < INICIO_TURNO_TARDE);
  const tarde = horarios.filter((horario) => aMinutos(horario.hora) >= INICIO_TURNO_TARDE);
  return `
    <div class="franjas">
      ${renderizarGrupoDeFranjas('Mañana', 'sol', manana, estado)}
      ${renderizarGrupoDeFranjas('Tarde', 'luna', tarde, estado)}
    </div>`;
}

function renderizarPasoFechaYHorario(estado, medico) {
  const disponibilidad = disponibilidadPorFecha(medico.id);
  return `
    ${renderizarMedicoElegido(medico)}
    <div class="agenda-reserva">
      <div>
        <h3 class="subtitulo">Selecciona una fecha</h3>
        ${renderizarCalendario(estado, disponibilidad)}
      </div>
      <div>
        <h3 class="subtitulo">Horarios disponibles</h3>
        ${renderizarHorariosDelDia(estado, medico)}
      </div>
    </div>
    <div class="campo campo--motivo">
      <label class="campo__etiqueta" for="motivoConsulta">Motivo de consulta <span class="campo__opcional">(opcional)</span></label>
      <textarea class="entrada" id="motivoConsulta" data-campo="motivo" maxlength="${LIMITE_MOTIVO}" placeholder="Describe brevemente tus síntomas o el motivo de la consulta">${escaparHtml(estado.motivo)}</textarea>
      <span class="campo__ayuda"><span>Ayuda al médico a preparar tu atención.</span><span data-region="contador-motivo">${estado.motivo.length}/${LIMITE_MOTIVO}</span></span>
    </div>`;
}

function renderizarCampoPago(definicion, estado) {
  const { campo, etiqueta, placeholder, longitud, teclado = 'numeric', completo = false } = definicion;
  const error = estado.erroresPago[campo];
  return `
    <div class="campo${completo ? ' campo--completo' : ''}">
      <label class="campo__etiqueta" for="pago-${campo}">${escaparHtml(etiqueta)}</label>
      <input class="entrada" id="pago-${campo}" data-campo="pago-${campo}" inputmode="${teclado}" maxlength="${longitud}"
        placeholder="${escaparHtml(placeholder)}" value="${escaparHtml(estado.pago[campo] ?? '')}" autocomplete="off"${error ? ' aria-invalid="true"' : ''}>
      ${error ? `<p class="campo__error" role="alert">${escaparHtml(error)}</p>` : ''}
    </div>`;
}

function renderizarPasoPago(estado) {
  return `
    <div class="metodos-pago" role="radiogroup" aria-label="Método de pago">
      ${METODOS_DE_PAGO.map((metodo) => `
        <label class="metodo-pago${metodo.id === estado.metodoPago ? ' metodo-pago--activo' : ''}">
          <input type="radio" name="metodoPago" value="${metodo.id}" data-campo="metodoPago"${metodo.id === estado.metodoPago ? ' checked' : ''}>
          <span class="metodo-pago__radio"></span>
          <span class="metodo-pago__etiqueta">${escaparHtml(metodo.etiqueta)}</span>
          ${metodo.marcas.map((marca) => `<span class="metodo-pago__marca">${marca}</span>`).join('')}
        </label>`).join('')}
    </div>
    <div class="pago-formulario">
      ${CAMPOS_POR_METODO[estado.metodoPago].map((definicion) => renderizarCampoPago(definicion, estado)).join('')}
    </div>
    <p class="pago-seguro">${icono('candado')}Pago protegido. Solo guardamos el identificador de la transacción.</p>
    ${renderizarAviso({
    tipo: 'info',
    titulo: `Si pagas después tendrás hasta ${HORAS_LIMITE_PAGO} horas`,
    mensaje: 'La cita quedará pendiente de pago y el horario bloqueado a tu nombre hasta el plazo.',
  })}`;
}

function validarPago({ metodoPago, pago }) {
  const errores = {};
  if (metodoPago === 'tarjeta') {
    const numero = (pago.numero ?? '').replace(/\s/g, '');
    if (!/^\d{13,19}$/.test(numero)) errores.numero = 'Ingresa de 13 a 19 dígitos.';
    if ((pago.titular ?? '').trim().length < 3) errores.titular = 'Ingresa el nombre del titular.';
    const vencimiento = /^(\d{2})\/(\d{2})$/.exec(pago.vencimiento ?? '');
    const ahora = new Date();
    const mes = Number(vencimiento?.[1]);
    const anio = 2000 + Number(vencimiento?.[2]);
    const vigente = vencimiento && mes >= 1 && mes <= 12 && (anio > ahora.getFullYear() || (anio === ahora.getFullYear() && mes >= ahora.getMonth() + 1));
    if (!vigente) errores.vencimiento = 'Usa una fecha vigente.';
    if (!/^\d{3,4}$/.test(pago.cvv ?? '')) errores.cvv = '3 o 4 dígitos.';
  } else {
    if (!/^9\d{8}$/.test((pago.celular ?? '').replace(/\s/g, ''))) errores.celular = '9 dígitos, empieza con 9.';
    if (!/^\d{6}$/.test(pago.codigo ?? '')) errores.codigo = 'Ingresa 6 dígitos.';
  }
  return errores;
}

function aplicarMascara(campo, valor) {
  const digitos = valor.replace(/\D/g, '');
  const mascaras = {
    'pago-numero': () => digitos.slice(0, 19).replace(/(.{4})/g, '$1 ').trim(),
    'pago-vencimiento': () => (digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}` : digitos),
    'pago-celular': () => digitos.slice(0, 9).replace(/(\d{3})(?=\d)/g, '$1 ').trim(),
    'pago-cvv': () => digitos.slice(0, 4),
    'pago-codigo': () => digitos.slice(0, 6),
  };
  return mascaras[campo] ? mascaras[campo]() : valor;
}

function renderizarError(estado) {
  return estado.error ? renderizarAviso({ tipo: 'peligro', mensaje: estado.error }) : '';
}

function puedeAvanzar(estado) {
  if (estado.paso === PASO_MEDICO) return Boolean(estado.medicoId && proximaFechaDisponible(estado.medicoId));
  if (estado.paso === PASO_FECHA_Y_HORARIO) return esHorarioReservable(storage.obtenerPorId('horarios', estado.horarioId));
  return false;
}

function renderizarAcciones(estado, medico) {
  const botonVolver = estado.paso > PASO_MEDICO
    ? `<button class="boton boton--secundario" type="button" data-accion="volver" ${estado.procesando ? 'disabled' : ''}>${icono('flechaIzquierda')}Atrás</button>`
    : '<span></span>';
  if (estado.paso === PASO_PAGO) {
    const deshabilitado = estado.procesando ? 'disabled' : '';
    return `
      <div class="acciones-paso">
        ${botonVolver}
        <div class="acciones-paso__derecha">
          <button class="boton boton--fantasma" type="button" data-accion="pagar-despues" ${deshabilitado}>Pagar después</button>
          <button class="boton boton--primario" type="button" data-accion="pagar-ahora" ${deshabilitado}>
            ${estado.procesando ? '<span class="giro" aria-hidden="true"></span>Procesando…' : `${icono('candado')}Pagar ${formatearMoneda(medico.tarifa)}`}
          </button>
        </div>
      </div>`;
  }
  const botonAvanzar = `<button class="boton boton--primario" type="button" data-accion="continuar" ${puedeAvanzar(estado) ? '' : 'disabled'}>Continuar${icono('flechaDerecha')}</button>`;
  return `<div class="acciones-paso">${botonVolver}${botonAvanzar}</div>`;
}

function renderizarResumen(estado, medico) {
  const horario = estado.horarioId ? storage.obtenerPorId('horarios', estado.horarioId) : null;
  const pendiente = '<span class="lista-datos__pendiente">Por seleccionar</span>';
  const cabecera = medico
    ? `<div class="resumen__medico">${renderizarAvatarMedico(medico, 'tarjeta')}<div><strong>${escaparHtml(medico.nombre)}</strong><small>${escaparHtml(medico.especialidad?.nombre ?? '')}</small></div></div>`
    : `<div class="resumen__medico resumen__medico--vacio"><span class="avatar">${icono('estetoscopio')}</span><p>Elige un médico para comenzar.</p></div>`;
  return `
    <aside class="panel resumen" aria-label="Resumen de la cita">
      <h2 class="panel__titulo">Resumen de la cita</h2>
      ${cabecera}
      <dl class="lista-datos">
        <div><dt>Fecha</dt><dd>${estado.fecha ? escaparHtml(formatearFecha(estado.fecha)) : pendiente}</dd></div>
        <div><dt>Hora</dt><dd>${horario ? escaparHtml(horario.hora) : pendiente}</dd></div>
        <div><dt>Lugar</dt><dd>${medico ? escaparHtml(medico.consultorio) : pendiente}</dd></div>
        <div class="lista-datos__total"><dt>Total a pagar</dt><dd>${medico ? formatearMoneda(medico.tarifa) : '—'}</dd></div>
      </dl>
      <ul class="resumen__garantias">
        <li>${icono('escudo')}Horario bloqueado al confirmar</li>
        <li>${icono('campana')}Te notificaremos cada cambio</li>
        <li>${icono('reprogramar')}Puedes reprogramar o cancelar</li>
      </ul>
    </aside>`;
}

function renderizarExito(estado) {
  const cita = storage.obtenerPorId('citas', estado.citaCreadaId);
  const medico = obtenerMedico(cita.medicoId);
  const pago = storage.buscar('pagos', (registro) => registro.citaId === cita.id);
  const pagada = pago?.estado === ESTADOS_PAGO.PAGADO;
  return `
    ${renderizarStepper(PASOS, PASOS.length)}
    <section class="panel exito-reserva">
      <span class="exito-reserva__anillo"><span>${icono('check')}</span></span>
      <h2 class="exito-reserva__titulo" data-titulo-paso tabindex="-1">¡Cita registrada con éxito!</h2>
      <p class="exito-reserva__texto">${pagada ? 'Tu pago fue aprobado y tu cita está confirmada.' : 'Tu cita quedó reservada. Completa el pago dentro del plazo para confirmarla.'}</p>
      <div class="ticket">
        <header class="ticket__cabecera"><span>Código de cita</span><b>${escaparHtml(cita.id)}</b></header>
        <div class="ticket__fila">${icono('estetoscopio')}<span>Médico</span><b>${escaparHtml(medico.nombre)}</b></div>
        <div class="ticket__fila">${icono('calendario')}<span>Fecha</span><b>${escaparHtml(formatearFechaLarga(cita.fecha))}</b></div>
        <div class="ticket__fila">${icono('reloj')}<span>Hora</span><b>${escaparHtml(cita.hora)}</b></div>
        <div class="ticket__fila">${icono('ubicacion')}<span>Lugar</span><b>${escaparHtml(cita.consultorio)}</b></div>
        <div class="ticket__fila">${icono('dinero')}<span>${pagada ? 'Pagado' : 'Monto'}</span><b>${formatearMoneda(pago?.monto)}${pagada && pago.transaccion ? ` · <span class="codigo">${escaparHtml(pago.transaccion)}</span>` : ''}</b></div>
        <div class="ticket__fila">${icono('info')}<span>Estado</span><b>${insigniaEstado(cita.estado)}</b></div>
      </div>
      ${pagada ? '' : renderizarAviso({ tipo: 'alerta', titulo: 'Pago pendiente', mensaje: `Realiza el pago antes del ${formatearMomento(pago.fechaLimite)} para confirmar tu cita.` })}
      <div class="exito-reserva__acciones">
        <a class="boton boton--primario" href="${construirHash('detalle-cita', { id: cita.id })}">${icono('documento')}Ver detalle de la cita</a>
        <button class="boton boton--secundario" type="button" data-accion="nueva-reserva">${icono('calendarioMas')}Reservar otra cita</button>
      </div>
    </section>`;
}

function renderizarAsistente(estado) {
  const medico = estado.medicoId ? obtenerMedico(estado.medicoId) : null;
  const contenidoPorPaso = [
    () => renderizarPasoMedico(estado),
    () => renderizarPasoFechaYHorario(estado, medico),
    () => renderizarPasoPago(estado),
  ];
  return `
    ${renderizarStepper(PASOS, estado.paso)}
    <div class="asistente">
      <section class="panel asistente__principal">
        <header class="asistente__cabecera">
          <p class="asistente__paso">Paso ${estado.paso + 1} de ${PASOS.length}</p>
          <h2 class="panel__titulo" data-titulo-paso tabindex="-1">${escaparHtml(TITULOS_DE_PASO[estado.paso])}</h2>
          <p class="asistente__subtitulo">${escaparHtml(SUBTITULOS_DE_PASO[estado.paso])}</p>
        </header>
        ${renderizarError(estado)}
        ${contenidoPorPaso[estado.paso]()}
        ${renderizarAcciones(estado, medico)}
      </section>
      ${renderizarResumen(estado, medico)}
    </div>`;
}

function aplicarParametrosIniciales(estado, params) {
  if (params.especialidad && storage.obtenerPorId('especialidades', params.especialidad)) {
    estado.especialidadId = params.especialidad;
  }
  const medico = params.medico ? obtenerMedico(params.medico) : null;
  if (medico?.activo && proximaFechaDisponible(medico.id)) {
    estado.medicoId = medico.id;
    estado.mesVisible = mesDeFecha(proximaFechaDisponible(medico.id));
    estado.paso = PASO_FECHA_Y_HORARIO;
  }
}

export default {
  id: 'reservar-cita',
  titulo: 'Reservar cita',
  icono: 'calendarioMas',
  roles: ['paciente'],
  seccion: 'Citas',
  montar(contenedor, { usuario, params }) {
    const paciente = obtenerPaciente(usuario.id);
    const estado = crearEstadoInicial();
    let montado = true;
    aplicarParametrosIniciales(estado, params);

    function renderizar({ enfocarTitulo = false } = {}) {
      const contenido = estado.paso === PASO_EXITO ? renderizarExito(estado) : renderizarAsistente(estado);
      contenedor.innerHTML = `
        ${renderizarEncabezado({ titulo: 'Reservar cita', descripcion: 'Agenda tu atención en cuatro pasos con el especialista de tu preferencia.' })}
        ${contenido}`;
      if (enfocarTitulo) contenedor.querySelector('[data-titulo-paso]')?.focus();
    }

    function irAPaso(paso) {
      estado.paso = paso;
      estado.error = '';
      renderizar({ enfocarTitulo: true });
    }

    function elegirMedico(medicoId) {
      if (estado.medicoId !== medicoId) {
        estado.medicoId = medicoId;
        estado.fecha = null;
        estado.horarioId = null;
        estado.mesVisible = mesDeFecha(proximaFechaDisponible(medicoId));
      }
      estado.error = '';
      renderizar();
    }

    function elegirFecha(fecha) {
      if (estado.fecha !== fecha) {
        estado.fecha = fecha;
        estado.horarioId = null;
      }
      estado.mesVisible = mesDeFecha(fecha);
      renderizar();
    }

    function cambiarMes(direccion) {
      const { anio, mes } = estado.mesVisible;
      const siguiente = new Date(anio, mes + direccion, 1);
      estado.mesVisible = { anio: siguiente.getFullYear(), mes: siguiente.getMonth() };
      renderizar();
    }

    function confirmarReserva({ pagarAhora }) {
      if (estado.procesando) return;
      if (pagarAhora) {
        estado.erroresPago = validarPago(estado);
        const [primerCampo] = Object.keys(estado.erroresPago);
        const numero = (estado.pago.numero ?? '').replace(/\s/g, '');
        estado.error = !primerCampo && estado.metodoPago === 'tarjeta' && numero.endsWith(TERMINACION_DE_TARJETA_RECHAZADA)
          ? 'El pago fue rechazado por el emisor. Prueba con otro medio de pago.'
          : '';
        if (primerCampo || estado.error) {
          renderizar();
          contenedor.querySelector(`#pago-${primerCampo}`)?.focus();
          return;
        }
      }
      estado.procesando = true;
      estado.error = '';
      renderizar();

      setTimeout(() => {
        if (!montado) return;
        try {
          const cita = registrarReserva({
            pacienteId: paciente.id,
            horarioId: estado.horarioId,
            motivo: estado.motivo,
            metodoPago: pagarAhora ? estado.metodoPago : null,
          });
          Object.assign(estado, { procesando: false, citaCreadaId: cita.id, paso: PASO_EXITO });
          renderizar({ enfocarTitulo: true });
          mostrarToast(pagarAhora ? `Pago aprobado. Cita ${cita.id} confirmada.` : `Cita ${cita.id} registrada. Pendiente de pago.`);
        } catch (error) {
          const esReglaDeNegocio = error instanceof ErrorDeDominio;
          if (!esReglaDeNegocio) console.error(error);
          estado.procesando = false;
          estado.error = esReglaDeNegocio ? error.message : 'No se pudo registrar la cita. Inténtalo nuevamente.';
          if (error.codigo === 'horario-no-disponible') {
            estado.horarioId = null;
            estado.paso = PASO_FECHA_Y_HORARIO;
          }
          renderizar({ enfocarTitulo: true });
          mostrarToast(estado.error, 'error');
        }
      }, DEMORA_DE_CONFIRMACION_MS);
    }

    const acciones = {
      'filtrar-especialidad': (boton) => {
        estado.especialidadId = boton.dataset.id;
        renderizar();
      },
      'consultar-disponibilidad': (boton) => {
        elegirMedico(boton.dataset.id);
        irAPaso(PASO_FECHA_Y_HORARIO);
      },
      'elegir-fecha': (boton) => elegirFecha(boton.dataset.fecha),
      'cambiar-mes': (boton) => cambiarMes(Number(boton.dataset.direccion)),
      'elegir-horario': (boton) => {
        estado.horarioId = boton.dataset.id;
        estado.error = '';
        renderizar();
      },
      'ir-a-paso': (boton) => irAPaso(Number(boton.dataset.paso)),
      continuar: () => {
        if (puedeAvanzar(estado)) irAPaso(estado.paso + 1);
      },
      volver: () => irAPaso(Math.max(0, estado.paso - 1)),
      'pagar-ahora': () => confirmarReserva({ pagarAhora: true }),
      'pagar-despues': () => confirmarReserva({ pagarAhora: false }),
      'nueva-reserva': () => {
        Object.assign(estado, crearEstadoInicial());
        renderizar({ enfocarTitulo: true });
      },
    };

    contenedor.addEventListener('click', (evento) => {
      const boton = evento.target.closest('[data-accion]');
      if (!boton || boton.disabled) return;
      acciones[boton.dataset.accion]?.(boton);
    });

    contenedor.addEventListener('change', (evento) => {
      if (evento.target.dataset.campo !== 'metodoPago') return;
      Object.assign(estado, { metodoPago: evento.target.value, pago: {}, erroresPago: {}, error: '' });
      renderizar();
      contenedor.querySelector('.pago-formulario .entrada')?.focus();
    });

    contenedor.addEventListener('input', (evento) => {
      const campo = evento.target.dataset.campo;
      if (campo === 'busqueda') {
        estado.busqueda = evento.target.value;
        contenedor.querySelector('[data-region="lista-medicos"]').innerHTML = renderizarListaMedicos(estado);
      }
      if (campo?.startsWith('pago-')) {
        const valor = aplicarMascara(campo, evento.target.value);
        evento.target.value = valor;
        estado.pago[campo.replace('pago-', '')] = valor;
      }
      if (campo === 'motivo') {
        estado.motivo = evento.target.value;
        contenedor.querySelector('[data-region="contador-motivo"]').textContent = `${estado.motivo.length}/${LIMITE_MOTIVO}`;
      }
    });

    const cancelarSuscripcion = storage.suscribir(({ origen }) => {
      if (origen === 'local' || estado.paso === PASO_EXITO || estado.procesando) return;
      if (origen === 'reinicio') {
        Object.assign(estado, crearEstadoInicial());
        renderizar();
        return;
      }
      const horarioElegido = estado.horarioId ? storage.obtenerPorId('horarios', estado.horarioId) : null;
      if (estado.horarioId && !esHorarioReservable(horarioElegido)) {
        estado.horarioId = null;
        if (estado.paso === PASO_PAGO) estado.paso = PASO_FECHA_Y_HORARIO;
        estado.error = 'El horario que habías elegido acaba de ser reservado desde otra sesión. Selecciona otro.';
        mostrarToast('Un horario de tu selección se ocupó.', 'info');
      }
      const enfocado = document.activeElement?.dataset?.campo;
      renderizar();
      if (enfocado) {
        const campo = contenedor.querySelector(`[data-campo="${enfocado}"]`);
        campo?.focus();
        campo?.setSelectionRange?.(campo.value.length, campo.value.length);
      }
    });

    renderizar();
    return () => {
      montado = false;
      cancelarSuscripcion();
    };
  },
};
