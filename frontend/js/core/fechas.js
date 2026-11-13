const LOCALE = 'es-PE';

const formatoFecha = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' });
const formatoFechaLarga = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const formatoDiaCorto = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
const formatoMesAnio = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' });
const formatoMesCorto = new Intl.DateTimeFormat(LOCALE, { month: 'short' });
const formatoMomento = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const MILISEGUNDOS_POR_MINUTO = 60 * 1000;

const rellenar = (numero) => String(numero).padStart(2, '0');

export function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function aISO(fecha) {
  return `${fecha.getFullYear()}-${rellenar(fecha.getMonth() + 1)}-${rellenar(fecha.getDate())}`;
}

export function desdeISO(fechaIso) {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

export function hoyISO() {
  return aISO(new Date());
}

export function ahoraISO() {
  return new Date().toISOString();
}

export function sumarDias(fechaIso, dias) {
  const fecha = desdeISO(fechaIso);
  fecha.setDate(fecha.getDate() + dias);
  return aISO(fecha);
}

export function sumarMinutos(fecha, minutos) {
  return new Date(fecha.getTime() + minutos * MILISEGUNDOS_POR_MINUTO);
}

export function diaDeLaSemana(fechaIso) {
  return desdeISO(fechaIso).getDay();
}

export function aMinutos(hora) {
  const [horas, minutos] = hora.split(':').map(Number);
  return horas * 60 + minutos;
}

export function desdeMinutos(totalMinutos) {
  return `${rellenar(Math.floor(totalMinutos / 60))}:${rellenar(totalMinutos % 60)}`;
}

export function combinarFechaHora(fechaIso, hora = '00:00') {
  const fecha = desdeISO(fechaIso);
  const [horas, minutos] = hora.split(':').map(Number);
  fecha.setHours(horas, minutos, 0, 0);
  return fecha;
}

export function esFuturo(fechaIso, hora = '23:59') {
  return combinarFechaHora(fechaIso, hora) > new Date();
}

export function compararFechaHora(a, b) {
  return `${a.fecha}T${a.hora}`.localeCompare(`${b.fecha}T${b.hora}`);
}

export function partesDeFecha(fechaIso) {
  const fecha = desdeISO(fechaIso);
  return { dia: fecha.getDate(), mes: formatoMesCorto.format(fecha).replace('.', '') };
}

export function formatearFecha(fechaIso) {
  return formatoFecha.format(desdeISO(fechaIso)).replace(/\./g, '');
}

export function formatearFechaLarga(fechaIso) {
  return capitalizar(formatoFechaLarga.format(desdeISO(fechaIso)));
}

export function formatearDiaCorto(fechaIso) {
  return capitalizar(formatoDiaCorto.format(desdeISO(fechaIso)).replace(/\./g, ''));
}

export function formatearMesAnio(anio, mes) {
  return capitalizar(formatoMesAnio.format(new Date(anio, mes, 1)));
}

export function formatearMomento(fechaHoraIso) {
  return formatoMomento.format(new Date(fechaHoraIso)).replace(/\./g, '');
}

export function formatearHace(fechaHoraIso) {
  const minutos = Math.round((Date.now() - new Date(fechaHoraIso).getTime()) / MILISEGUNDOS_POR_MINUTO);
  if (minutos < 1) return 'Hace un momento';
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  return formatearMomento(fechaHoraIso);
}
