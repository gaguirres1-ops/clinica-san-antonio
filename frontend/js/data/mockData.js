import {
  aISO,
  aMinutos,
  ahoraISO,
  combinarFechaHora,
  desdeMinutos,
  diaDeLaSemana,
  esFuturo,
  sumarDias,
  sumarMinutos,
} from '../core/fechas.js';

export const VERSION_DATOS = 4;

const PACIENTE_PRINCIPAL_ID = 'PAC-001';

const DIAS_DE_AGENDA = 28;
const DIAS_CON_OCUPACION_SIMULADA = 21;
const PROBABILIDAD_OCUPADO = 0.2;
const PROBABILIDAD_BLOQUEADO = 0.04;
const HORAS_LIMITE_PAGO = 24;
const SEMILLA = 20261113;

const ESPECIALIDADES = [
  { id: 'ESP-001', nombre: 'Medicina General', descripcion: 'Atención primaria, chequeos preventivos y derivación a especialistas.' },
  { id: 'ESP-002', nombre: 'Cardiología', descripcion: 'Prevención, diagnóstico y tratamiento de enfermedades cardiovasculares.' },
  { id: 'ESP-003', nombre: 'Pediatría', descripcion: 'Control de crecimiento, vacunación y atención de niños y adolescentes.' },
  { id: 'ESP-004', nombre: 'Traumatología', descripcion: 'Lesiones del sistema músculo-esquelético, fracturas y rehabilitación.' },
  { id: 'ESP-005', nombre: 'Dermatología', descripcion: 'Enfermedades de la piel, cabello y uñas.' },
  { id: 'ESP-006', nombre: 'Ginecología', descripcion: 'Salud reproductiva, controles anuales y seguimiento prenatal.' },
  { id: 'ESP-007', nombre: 'Neurología', descripcion: 'Trastornos del sistema nervioso central y periférico.' },
];

const MEDICOS = [
  {
    id: 'MED-001', dni: '08154236', credencial: 'be960853e20aa3657309287209fe45c708935f64bb96bafb4c076f03e17b2c08', nombre: 'Dr. Carlos Mendoza Ríos', especialidadId: 'ESP-002', cmp: '045821', rne: '23104',
    tarifa: 150, consultorio: 'Consultorio 204 · Piso 2', activo: true,
    jornada: { dias: [1, 3, 5], bloques: [['08:00', '12:00']], duracionMinutos: 30 },
  },
  {
    id: 'MED-002', dni: '09241875', credencial: 'e8eca022c94782e95d38f9aa92b5e986b8bbcf52bd48469c395213f5140cd50b', nombre: 'Dra. Lucía Paredes Salazar', especialidadId: 'ESP-003', cmp: '052310', rne: '27815',
    tarifa: 120, consultorio: 'Consultorio 105 · Piso 1', activo: true,
    jornada: { dias: [1, 2, 3, 4, 5], bloques: [['14:00', '18:00']], duracionMinutos: 30 },
  },
  {
    id: 'MED-003', dni: '10365482', credencial: '07edc9e0d46b5193d6734dd027a1e9a13970e0c0932fd42bf7d723d3a7884d93', nombre: 'Dr. Javier Huamán Torres', especialidadId: 'ESP-004', cmp: '038774', rne: '19642',
    tarifa: 140, consultorio: 'Consultorio 310 · Piso 3', activo: true,
    jornada: { dias: [2, 4, 6], bloques: [['08:00', '12:30']], duracionMinutos: 30 },
  },
  {
    id: 'MED-004', dni: '41578263', credencial: '5e94e971f01e31f544dc9ae8b8c251a3da5ff1d601c4d505080929fe4e644307', nombre: 'Dra. Andrea Castillo Vega', especialidadId: 'ESP-005', cmp: '061295', rne: '31277',
    tarifa: 130, consultorio: 'Consultorio 212 · Piso 2', activo: true,
    jornada: { dias: [1, 3, 5], bloques: [['15:00', '19:00']], duracionMinutos: 30 },
  },
  {
    id: 'MED-005', dni: '07456231', credencial: '49350510ced96f42d63b19f8950c46fba88572f83948cde07e4f186f8ed92977', nombre: 'Dr. Ricardo Salinas Ponce', especialidadId: 'ESP-001', cmp: '029467', rne: null,
    tarifa: 80, consultorio: 'Consultorio 101 · Piso 1', activo: true,
    jornada: { dias: [1, 2, 3, 4, 5, 6], bloques: [['08:00', '12:00']], duracionMinutos: 20 },
  },
  {
    id: 'MED-006', dni: '42983517', credencial: 'f6154759f2d3eb48b26b8308cce3aa9f6384dd7535aff2d07cb3a5540b4cc310', nombre: 'Dra. Patricia Rojas Medina', especialidadId: 'ESP-006', cmp: '057183', rne: '29930',
    tarifa: 140, consultorio: 'Consultorio 215 · Piso 2', activo: true,
    jornada: { dias: [2, 4], bloques: [['09:00', '13:00'], ['15:00', '18:00']], duracionMinutos: 30 },
  },
  {
    id: 'MED-007', dni: '06718394', credencial: '0682197f0a4b6a1d268c5edca644d2d234531becf5d5da6768d8998bc12b589c', nombre: 'Dr. Fernando Ccori Lazo', especialidadId: 'ESP-007', cmp: '049552', rne: '25018',
    tarifa: 160, consultorio: 'Consultorio 308 · Piso 3', activo: true,
    jornada: { dias: [3, 5], bloques: [['09:00', '13:00']], duracionMinutos: 40 },
  },
  {
    id: 'MED-008', dni: '44125869', credencial: 'eb4a9b5ee5232ad74beddf54568ffc8cd7975bf661b7bd8c26021e68016971cb', nombre: 'Dra. Gabriela Núñez Arce', especialidadId: 'ESP-002', cmp: '063018', rne: '32406',
    tarifa: 150, consultorio: 'Consultorio 206 · Piso 2', activo: true,
    jornada: { dias: [1, 2, 3, 4, 5], bloques: [['08:00', '12:00'], ['14:00', '18:00']], duracionMinutos: 30 },
  },
  {
    id: 'MED-009', dni: '05982741', credencial: '03b540a715e42b567334a4c7bb826c2cbb599123a9a65bb40d6e7815228c3d13', nombre: 'Dr. Miguel Ángel Tapia Soto', especialidadId: 'ESP-001', cmp: '041236', rne: null,
    tarifa: 80, consultorio: 'Consultorio 102 · Piso 1', activo: true,
    jornada: { dias: [1, 2, 3, 4, 5], bloques: [['08:00', '12:00'], ['16:00', '20:00']], duracionMinutos: 20 },
  },
];

const PACIENTES = [
  { id: 'PAC-001', nombre: 'María Fernanda Quispe Huamán', dni: '72845163', credencial: 'e24bb1069562c7289e9e8683e1b71995b7c04d5bd1004ef71ced26b348954ba3', fechaNacimiento: '1991-04-17', sexo: 'F', telefono: '987 654 321', correo: 'mfquispe@correo.pe', seguro: 'Rímac EPS', alergias: 'Penicilina' },
  { id: 'PAC-002', nombre: 'José Luis Ramírez Soto', dni: '40918276', credencial: 'db37f2679ab5d2ed8e737945f5404aa4dfc417d9b3839400115578c17d94f004', fechaNacimiento: '1968-11-02', sexo: 'M', telefono: '976 123 458', correo: 'jlramirez@correo.pe', seguro: 'Pacífico EPS', alergias: 'Ninguna conocida' },
  { id: 'PAC-003', nombre: 'Carmen Rosa Flores Díaz', dni: '45620981', credencial: '8df6eb4701c23cc097982ce8a3f51cae939c50874ef0c4de4e197ba44d1d2035', fechaNacimiento: '1983-06-25', sexo: 'F', telefono: '965 447 120', correo: 'cflores@correo.pe', seguro: 'Particular', alergias: 'Ninguna conocida' },
  { id: 'PAC-004', nombre: 'Luis Alberto Chávez Mori', dni: '09874512', credencial: 'f48b4173e403e6ca8d90959fbd5c0da99c27f487028ac0b294b0f07b3d0e0bd3', fechaNacimiento: '1959-02-09', sexo: 'M', telefono: '944 210 377', correo: 'lachavez@correo.pe', seguro: 'Mapfre EPS', alergias: 'AINEs' },
  { id: 'PAC-005', nombre: 'Ana Lucía Gutiérrez Paz', dni: '71236548', credencial: 'e41db23740daf940157da1000223391964e1e9a9ad8c50f93454bd7c145530ce', fechaNacimiento: '1997-09-30', sexo: 'F', telefono: '951 380 664', correo: 'agutierrez@correo.pe', seguro: 'Particular', alergias: 'Ninguna conocida' },
  { id: 'PAC-006', nombre: 'Pedro Pablo Vargas León', dni: '43159872', credencial: 'd10aa257a708e8e9a5b2039006c94603104a55809621662049c7a94a908ebb08', fechaNacimiento: '1986-12-14', sexo: 'M', telefono: '923 556 019', correo: 'ppvargas@correo.pe', seguro: 'Rímac EPS', alergias: 'Mariscos' },
  { id: 'PAC-007', nombre: 'Valeria Sofía Mendoza Cruz', dni: '78451236', credencial: '9ab9e3591335a64aef044710d9111c6bdd658878d7b1f957cabc3ba8a1e19331', fechaNacimiento: '2019-03-08', sexo: 'F', telefono: '989 002 415', correo: 'familia.mendoza@correo.pe', seguro: 'Pacífico EPS', alergias: 'Ninguna conocida' },
  { id: 'PAC-008', nombre: 'Jorge Enrique Salazar Ríos', dni: '10457823', credencial: '5b7aa19f86d5e219c740ea8bcaa532757cd5c6782f7bc3535bfaabcec474d9bf', fechaNacimiento: '1975-07-21', sexo: 'M', telefono: '912 774 806', correo: 'jesalazar@correo.pe', seguro: 'Particular', alergias: 'Ninguna conocida' },
];

const ADMINISTRADORES = [
  { id: 'ADM-001', dni: '43210987', credencial: 'f914b2446762ec10d0c2bd70996636785d1132bc916ede21c0aaa8a28bf116b9', nombre: 'Rosa Valdivia Campos', cargo: 'Coordinadora de Admisión' },
];

const MOTIVOS_FRECUENTES = [
  'Control de rutina.',
  'Dolor persistente desde hace una semana.',
  'Lectura de resultados de laboratorio.',
  'Seguimiento de tratamiento indicado.',
  'Malestar general y fiebre intermitente.',
  'Chequeo preventivo anual.',
  'Evaluación por derivación de medicina general.',
];

const METODOS_DE_PAGO = ['Tarjeta de crédito', 'Tarjeta de débito', 'Yape', 'Plin'];

const CITAS_FUTURAS = [
  { pacienteId: 'PAC-001', medicoId: 'MED-004', desdeDia: 2, posicion: 1, estado: 'Confirmada', motivo: 'Control de lesión pigmentada en antebrazo izquierdo.' },
  { pacienteId: 'PAC-001', medicoId: 'MED-007', desdeDia: 5, posicion: 0, estado: 'Pendiente de pago', motivo: 'Cefalea recurrente de predominio matutino.' },
  { pacienteId: 'PAC-002', medicoId: 'MED-001', desdeDia: 0, posicion: 1, estado: 'Confirmada', motivo: 'Control de presión arterial y ajuste de medicación.' },
  { pacienteId: 'PAC-003', medicoId: 'MED-001', desdeDia: 0, posicion: 3, estado: 'Confirmada', motivo: 'Palpitaciones al realizar esfuerzo físico.' },
  { pacienteId: 'PAC-004', medicoId: 'MED-001', desdeDia: 2, posicion: 2, estado: 'Pendiente de pago', motivo: 'Evaluación cardiológica preoperatoria.' },
  { pacienteId: 'PAC-006', medicoId: 'MED-006', desdeDia: 3, posicion: 2, estado: 'Reprogramada', motivo: 'Control ginecológico anual.' },
  { pacienteId: 'PAC-005', medicoId: 'MED-003', desdeDia: 4, posicion: 3, estado: 'Cancelada', motivo: 'Dolor de rodilla derecha tras caída.' },
];

const CITAS_PASADAS = [
  {
    pacienteId: 'PAC-001', medicoId: 'MED-001', haceDias: 21, hora: '09:00', motivo: 'Mareos y presión elevada en controles caseros.',
    atencion: {
      diagnostico: 'Hipertensión arterial esencial, estadio 1', codigoCie10: 'I10',
      tratamiento: 'Losartán 50 mg cada 24 horas por 30 días.',
      indicaciones: 'Dieta hiposódica, actividad física moderada 30 minutos diarios y registro de presión arterial dos veces al día.',
      observaciones: 'Control en 4 semanas con perfil lipídico y electrocardiograma.',
    },
  },
  {
    pacienteId: 'PAC-001', medicoId: 'MED-005', haceDias: 47, hora: '10:20', motivo: 'Dolor de garganta y fiebre de 38 °C.',
    atencion: {
      diagnostico: 'Faringoamigdalitis aguda', codigoCie10: 'J03.9',
      tratamiento: 'Azitromicina 500 mg cada 24 horas por 3 días. Paracetamol 500 mg cada 8 horas si hay fiebre.',
      indicaciones: 'Hidratación abundante y reposo relativo por 48 horas.',
      observaciones: 'Alergia a penicilina registrada; se evita betalactámico.',
    },
  },
  {
    pacienteId: 'PAC-002', medicoId: 'MED-001', haceDias: 14, hora: '08:30', motivo: 'Dolor torácico atípico.',
    atencion: {
      diagnostico: 'Dolor torácico no cardiogénico', codigoCie10: 'R07.4',
      tratamiento: 'Omeprazol 20 mg en ayunas por 14 días.',
      indicaciones: 'Evitar comidas copiosas por la noche.',
      observaciones: 'Electrocardiograma y troponinas dentro de rangos normales.',
    },
  },
  {
    pacienteId: 'PAC-003', medicoId: 'MED-009', haceDias: 9, hora: '17:00', motivo: 'Chequeo preventivo anual.',
    atencion: {
      diagnostico: 'Examen médico general sin hallazgos anormales', codigoCie10: 'Z00.0',
      tratamiento: 'No requiere tratamiento farmacológico.',
      indicaciones: 'Hemograma y glucosa en ayunas anual.',
      observaciones: 'Se deriva a cardiología por referencia de palpitaciones ocasionales.',
    },
  },
  {
    pacienteId: 'PAC-007', medicoId: 'MED-002', haceDias: 6, hora: '15:00', motivo: 'Tos y congestión nasal desde hace 4 días.',
    atencion: {
      diagnostico: 'Rinofaringitis aguda', codigoCie10: 'J00',
      tratamiento: 'Lavados nasales con suero fisiológico cada 6 horas. Paracetamol en jarabe según peso si hay fiebre.',
      indicaciones: 'Volver si presenta dificultad respiratoria o fiebre mayor a 72 horas.',
      observaciones: 'Vacunación completa para la edad.',
    },
  },
  { pacienteId: 'PAC-008', medicoId: 'MED-004', haceDias: 3, hora: '16:00', motivo: 'Lesiones en manos por contacto con detergentes.', cancelada: true },
];

function crearGeneradorAleatorio(semilla) {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6D2B79F5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function crearSecuencia(prefijo) {
  let ultimo = 0;
  return () => `${prefijo}-${String(++ultimo).padStart(4, '0')}`;
}

function elegirAlAzar(lista, aleatorio) {
  return lista[Math.floor(aleatorio() * lista.length)];
}

function generarHorarios(fechaInicio, siguienteIdHorario) {
  const horarios = [];
  for (let desplazamiento = 0; desplazamiento < DIAS_DE_AGENDA; desplazamiento++) {
    const fecha = sumarDias(fechaInicio, desplazamiento);
    const dia = diaDeLaSemana(fecha);
    MEDICOS.filter((medico) => medico.jornada.dias.includes(dia)).forEach((medico) => {
      medico.jornada.bloques.forEach(([inicio, fin]) => {
        for (let minuto = aMinutos(inicio); minuto + medico.jornada.duracionMinutos <= aMinutos(fin); minuto += medico.jornada.duracionMinutos) {
          horarios.push({
            id: siguienteIdHorario(),
            medicoId: medico.id,
            fecha,
            hora: desdeMinutos(minuto),
            duracionMinutos: medico.jornada.duracionMinutos,
            estado: 'disponible',
            citaId: null,
          });
        }
      });
    });
  }
  return horarios.sort((a, b) => `${a.fecha}${a.hora}${a.medicoId}`.localeCompare(`${b.fecha}${b.hora}${b.medicoId}`));
}

function diaLaborablePrevio(medico, fechaReferencia, haceDias) {
  let fecha = sumarDias(fechaReferencia, -haceDias);
  while (!medico.jornada.dias.includes(diaDeLaSemana(fecha))) {
    fecha = sumarDias(fecha, -1);
  }
  return fecha;
}

function restarHoras(fechaIso, hora, horas) {
  return sumarMinutos(combinarFechaHora(fechaIso, hora), -horas * 60).toISOString();
}

export function crearDatosIniciales(fechaReferencia = new Date()) {
  const hoy = aISO(fechaReferencia);
  const aleatorio = crearGeneradorAleatorio(SEMILLA);
  const siguienteId = {
    horario: crearSecuencia('HOR'),
    cita: crearSecuencia('CIT'),
    pago: crearSecuencia('PAG'),
    historia: crearSecuencia('HC'),
    notificacion: crearSecuencia('NOT'),
  };

  const horarios = generarHorarios(hoy, siguienteId.horario);
  const citas = [];
  const pagos = [];
  const historialClinico = [];
  const notificaciones = [];

  const buscarMedico = (id) => MEDICOS.find((medico) => medico.id === id);
  const buscarPaciente = (id) => PACIENTES.find((paciente) => paciente.id === id);

  function registrarPago(cita, { estado, creadaEn }) {
    const medico = buscarMedico(cita.medicoId);
    const pagado = estado === 'Pagado' || estado === 'Reembolsado';
    const fechaPago = pagado ? sumarMinutos(new Date(creadaEn), 25 + Math.floor(aleatorio() * 240)).toISOString() : null;
    const pago = {
      id: siguienteId.pago(),
      citaId: cita.id,
      pacienteId: cita.pacienteId,
      monto: medico.tarifa,
      moneda: 'PEN',
      metodo: pagado ? elegirAlAzar(METODOS_DE_PAGO, aleatorio) : null,
      estado,
      fechaLimite: sumarMinutos(new Date(creadaEn), HORAS_LIMITE_PAGO * 60).toISOString(),
      fechaPago,
    };
    pagos.push(pago);
    return pago;
  }

  function crearCita({ pacienteId, medicoId, horario, fecha, hora, motivo, estado, creadaEn }) {
    const medico = buscarMedico(medicoId);
    const paciente = buscarPaciente(pacienteId);
    const cita = {
      id: siguienteId.cita(),
      pacienteId,
      medicoId,
      especialidadId: medico.especialidadId,
      horarioId: horario?.id ?? null,
      fecha: horario?.fecha ?? fecha,
      hora: horario?.hora ?? hora,
      consultorio: medico.consultorio,
      motivo,
      estado,
      creadaEn,
      eventos: [{ fecha: creadaEn, descripcion: 'Cita registrada desde el portal del paciente.', actor: paciente.nombre }],
    };
    citas.push(cita);
    return cita;
  }

  function ocupar(horario, cita) {
    horario.estado = 'ocupado';
    horario.citaId = cita.id;
  }

  function horariosReservables(medicoId, desdeDia) {
    const fechaMinima = sumarDias(hoy, desdeDia);
    return horarios.filter((horario) => horario.medicoId === medicoId
      && horario.estado === 'disponible'
      && horario.fecha >= fechaMinima
      && esFuturo(horario.fecha, horario.hora));
  }

  CITAS_PASADAS.forEach((semilla) => {
    const medico = buscarMedico(semilla.medicoId);
    const fecha = diaLaborablePrevio(medico, hoy, semilla.haceDias);
    const creadaEn = restarHoras(fecha, semilla.hora, 72);
    const cita = crearCita({ ...semilla, fecha, estado: semilla.cancelada ? 'Cancelada' : 'Atendida', creadaEn });
    const pago = registrarPago(cita, { estado: semilla.cancelada ? 'Reembolsado' : 'Pagado', creadaEn });
    cita.eventos.push({ fecha: pago.fechaPago, descripcion: `Pago confirmado con ${pago.metodo}.`, actor: 'Caja virtual' });

    if (semilla.cancelada) {
      cita.eventos.push({ fecha: restarHoras(fecha, semilla.hora, 30), descripcion: 'Cita cancelada por el paciente. Se generó el reembolso.', actor: buscarPaciente(semilla.pacienteId).nombre });
      return;
    }

    const registradoEn = sumarMinutos(combinarFechaHora(fecha, semilla.hora), 25).toISOString();
    cita.eventos.push({ fecha: registradoEn, descripcion: 'Atención registrada con diagnóstico.', actor: medico.nombre });
    historialClinico.push({
      id: siguienteId.historia(),
      pacienteId: cita.pacienteId,
      medicoId: cita.medicoId,
      citaId: cita.id,
      fecha,
      ...semilla.atencion,
      registradoEn,
    });
  });

  const citasSemilla = CITAS_FUTURAS.map((semilla) => {
    const horario = horariosReservables(semilla.medicoId, semilla.desdeDia)[semilla.posicion];
    if (!horario) return null;
    const creadaEn = restarHoras(horario.fecha, horario.hora, semilla.estado === 'Pendiente de pago' ? 30 : 96);
    const cita = crearCita({ ...semilla, horario, creadaEn: new Date(Math.min(new Date(creadaEn).getTime(), Date.now() - 3600000)).toISOString() });
    const pagado = semilla.estado !== 'Pendiente de pago';
    const pago = registrarPago(cita, { estado: semilla.estado === 'Cancelada' ? 'Reembolsado' : pagado ? 'Pagado' : 'Pendiente', creadaEn: cita.creadaEn });

    if (pagado) {
      cita.eventos.push({ fecha: pago.fechaPago, descripcion: `Pago confirmado con ${pago.metodo}. Estado: Confirmada.`, actor: 'Caja virtual' });
    }
    if (semilla.estado === 'Cancelada') {
      cita.eventos.push({ fecha: sumarMinutos(new Date(pago.fechaPago), 180).toISOString(), descripcion: 'Cita cancelada por el paciente. Horario liberado y reembolso generado.', actor: buscarPaciente(semilla.pacienteId).nombre });
      return cita;
    }
    if (semilla.estado === 'Reprogramada') {
      cita.eventos.push({ fecha: sumarMinutos(new Date(pago.fechaPago), 300).toISOString(), descripcion: 'Cita reprogramada por el paciente a un nuevo horario.', actor: buscarPaciente(semilla.pacienteId).nombre });
    }
    ocupar(horario, cita);
    return cita;
  });

  const pacientesSimulados = PACIENTES.filter((paciente) => paciente.id !== PACIENTE_PRINCIPAL_ID);
  const fechaLimiteSimulacion = sumarDias(hoy, DIAS_CON_OCUPACION_SIMULADA);

  horarios
    .filter((horario) => horario.estado === 'disponible' && horario.fecha < fechaLimiteSimulacion && esFuturo(horario.fecha, horario.hora))
    .forEach((horario) => {
      const sorteo = aleatorio();
      if (sorteo < PROBABILIDAD_BLOQUEADO) {
        horario.estado = 'bloqueado';
        return;
      }
      if (sorteo > PROBABILIDAD_BLOQUEADO + PROBABILIDAD_OCUPADO) return;

      const pendiente = aleatorio() < 0.2;
      const creadaEn = new Date(Date.now() - (2 + Math.floor(aleatorio() * (pendiente ? 18 : 120))) * 3600000).toISOString();
      const cita = crearCita({
        pacienteId: elegirAlAzar(pacientesSimulados, aleatorio).id,
        medicoId: horario.medicoId,
        horario,
        motivo: elegirAlAzar(MOTIVOS_FRECUENTES, aleatorio),
        estado: pendiente ? 'Pendiente de pago' : 'Confirmada',
        creadaEn,
      });
      const pago = registrarPago(cita, { estado: pendiente ? 'Pendiente' : 'Pagado', creadaEn });
      if (!pendiente) {
        cita.eventos.push({ fecha: pago.fechaPago, descripcion: `Pago confirmado con ${pago.metodo}. Estado: Confirmada.`, actor: 'Caja virtual' });
      }
      ocupar(horario, cita);
    });

  const [citaDermatologia, citaNeurologia, , , citaPreoperatoria, citaReprogramada, citaCancelada] = citasSemilla;
  const atencionHipertension = historialClinico[0];
  const ahora = Date.now();
  const haceMinutos = (minutos) => new Date(ahora - minutos * 60000).toISOString();

  const notificacionesSemilla = [
    citaNeurologia && {
      destinatarioRol: 'paciente', destinatarioId: 'PAC-001', citaId: citaNeurologia.id, leida: false, fecha: haceMinutos(40),
      titulo: 'Pago pendiente', mensaje: 'Tu cita de Neurología está pendiente de pago. Complétalo para confirmar tu reserva.',
    },
    citaDermatologia && {
      destinatarioRol: 'paciente', destinatarioId: 'PAC-001', citaId: citaDermatologia.id, leida: false, fecha: haceMinutos(180),
      titulo: 'Recordatorio de cita', mensaje: 'Tienes una cita confirmada en Dermatología. Llega 15 minutos antes con tu DNI.',
    },
    atencionHipertension && {
      destinatarioRol: 'paciente', destinatarioId: 'PAC-001', citaId: atencionHipertension.citaId, leida: true, fecha: atencionHipertension.registradoEn,
      titulo: 'Diagnóstico disponible', mensaje: 'El Dr. Carlos Mendoza Ríos registró el diagnóstico de tu última atención.',
    },
    citaPreoperatoria && {
      destinatarioRol: 'medico', destinatarioId: 'MED-001', citaId: citaPreoperatoria.id, leida: false, fecha: haceMinutos(55),
      titulo: 'Nueva cita agendada', mensaje: 'Luis Alberto Chávez Mori reservó una evaluación preoperatoria.',
    },
    {
      destinatarioRol: 'medico', destinatarioId: 'MED-001', citaId: null, leida: true, fecha: haceMinutos(1440),
      titulo: 'Agenda publicada', mensaje: 'Tu agenda de las próximas cuatro semanas está disponible para reservas.',
    },
    citaCancelada && {
      destinatarioRol: 'administrador', destinatarioId: null, citaId: citaCancelada.id, leida: false, fecha: haceMinutos(95),
      titulo: 'Cita cancelada', mensaje: 'Ana Lucía Gutiérrez Paz canceló su cita de Traumatología. El horario fue liberado.',
    },
    citaReprogramada && {
      destinatarioRol: 'administrador', destinatarioId: null, citaId: citaReprogramada.id, leida: false, fecha: haceMinutos(260),
      titulo: 'Cita reprogramada', mensaje: 'Pedro Pablo Vargas León reprogramó su control de Ginecología.',
    },
  ];

  notificacionesSemilla.filter(Boolean).forEach((notificacion) => {
    notificaciones.push({ id: siguienteId.notificacion(), ...notificacion });
  });

  return {
    version: VERSION_DATOS,
    generadoEn: ahoraISO(),
    especialidades: structuredClone(ESPECIALIDADES),
    medicos: structuredClone(MEDICOS),
    pacientes: structuredClone(PACIENTES),
    administradores: structuredClone(ADMINISTRADORES),
    horarios,
    citas,
    pagos,
    historialClinico,
    notificaciones,
  };
}
