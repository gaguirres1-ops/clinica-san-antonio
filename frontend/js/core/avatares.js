const ESTILOS_POR_MEDICO = {
  'MED-001': { skin: '#DDAA80', shade: '#C98F65', hair: '#2B211B', style: 'short', glasses: true, scrub: '#2F7FE8' },
  'MED-002': { skin: '#EBC09B', shade: '#DBA67D', hair: '#2A1C16', style: 'long', scrub: '#1E9DB0', bg: ['#E6F6F8', '#C4E6EE'] },
  'MED-003': { skin: '#CD956B', shade: '#B87F55', hair: '#231A15', style: 'short', beard: true, scrub: '#2F7FE8' },
  'MED-004': { skin: '#E6B590', shade: '#D49E78', hair: '#3A2A22', style: 'bun', glasses: true, scrub: '#5B6EE1', bg: ['#EAEDFF', '#CDD6FA'] },
  'MED-005': { skin: '#D5A07A', shade: '#C08A62', hair: '#8A909B', style: 'short', scrub: '#1E9DB0', bg: ['#E6F6F8', '#C4E6EE'] },
  'MED-006': { skin: '#EEC6A3', shade: '#DDAB86', hair: '#523829', style: 'long', scrub: '#2F7FE8' },
  'MED-007': { skin: '#CF986F', shade: '#BA825A', hair: '#2B211B', style: 'short', beard: true, glasses: true, scrub: '#5B6EE1', bg: ['#EAEDFF', '#CDD6FA'] },
  'MED-008': { skin: '#DDAA82', shade: '#C9926A', hair: '#3A2B24', style: 'long', scrub: '#2F7FE8' },
  'MED-009': { skin: '#D0A07C', shade: '#BB8963', hair: '#8A909B', style: 'short', glasses: true, scrub: '#2F7FE8' },
};

const ESTILO_POR_DEFECTO = ESTILOS_POR_MEDICO['MED-001'];

function dibujarCabelloTrasero(estilo, color) {
  if (estilo === 'long') {
    return `<path d="M62 100C54 54 76 36 100 36s46 18 38 64l5 50c-10 9-22 4-24-14H81c-2 18-14 23-24 14z" fill="${color}"/>`;
  }
  if (estilo === 'bun') {
    return `<circle cx="100" cy="33" r="16" fill="${color}"/><circle cx="100" cy="33" r="16" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="2"/>`;
  }
  return '';
}

function dibujarCabelloFrontal(estilo, color) {
  if (estilo === 'short') {
    return `<path d="M65 92C60 54 80 40 100 40s40 14 35 52c-3-15-8-26-17-30-12 5-27 4-38-2-8 6-13 18-15 32z" fill="${color}"/>`;
  }
  return `<path d="M65 96C60 56 80 42 100 42s40 14 35 54c-7-22-16-34-33-38-14 6-27 16-37 38z" fill="${color}"/>`;
}

function dibujarBarba(color) {
  return `<path d="M68 104c2 22 14 36 32 36s30-14 32-36c-5 8-10 12-16 13-5-4-11-5-16-5s-11 1-16 5c-6-1-11-5-16-13z" fill="${color}" opacity=".92"/>`;
}

function dibujarLentes() {
  return '<g fill="none" stroke="#1C2A40" stroke-width="2.4"><rect x="73" y="84" width="22" height="17" rx="7"/><rect x="105" y="84" width="22" height="17" rx="7"/><path d="M95 91h10"/></g>';
}

export function dibujarAvatarMedico(medicoId) {
  const {
    skin, shade, hair, style, scrub, glasses = false, beard = false, bg = ['#E4F0FF', '#C5DDFA'],
  } = ESTILOS_POR_MEDICO[medicoId] ?? ESTILO_POR_DEFECTO;
  const uid = String(medicoId).replace(/\W/g, '');
  return `<svg viewBox="0 0 200 200" focusable="false" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax slice">
  <defs>
    <linearGradient id="fondo${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient>
    <linearGradient id="bata${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E8F0FA"/></linearGradient>
    <radialGradient id="rostro${uid}" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="${skin}"/><stop offset="1" stop-color="${shade}"/></radialGradient>
  </defs>
  <rect width="200" height="200" fill="url(#fondo${uid})"/>
  ${dibujarCabelloTrasero(style, hair)}
  <path d="M14 200c2-40 38-60 86-60s84 20 86 60z" fill="url(#bata${uid})"/>
  <path d="M14 200c2-40 38-60 86-60" fill="none" stroke="#CFDCEE" stroke-width="1.5"/>
  <path d="M78 143l22 38 22-38z" fill="${scrub}"/>
  <path d="M78 143l22 38-18 19H50c3-26 14-46 28-57z" fill="#F2F7FD" stroke="#D4E0F0" stroke-width="1.2"/>
  <path d="M122 143l-22 38 18 19h32c-3-26-14-46-28-57z" fill="#F2F7FD" stroke="#D4E0F0" stroke-width="1.2"/>
  <path d="M82 144c-12 22-10 40 10 42 14 1 22-8 22-20" fill="none" stroke="#1B2B44" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M120 145c8 10 10 18 6 26" fill="none" stroke="#1B2B44" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="114" cy="168" r="6" fill="#B9C9DC" stroke="#1B2B44" stroke-width="2.6"/>
  <path d="M86 116v26q14 12 28 0v-26z" fill="${shade}"/>
  <path d="M86 128q14 10 28 0v-6q-14 8-28 0z" fill="rgba(0,0,0,.08)"/>
  <ellipse cx="66" cy="94" rx="7" ry="9" fill="${shade}"/><ellipse cx="134" cy="94" rx="7" ry="9" fill="${shade}"/>
  <ellipse cx="100" cy="92" rx="35" ry="41" fill="url(#rostro${uid})"/>
  ${beard ? dibujarBarba(hair) : ''}
  ${dibujarCabelloFrontal(style, hair)}
  <ellipse cx="86" cy="94" rx="2.8" ry="3.4" fill="#2A2320"/><ellipse cx="114" cy="94" rx="2.8" ry="3.4" fill="#2A2320"/>
  <path d="M79 85q7-4 14 0M107 85q7-4 14 0" stroke="${hair}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M100 98q-3 9 1 11" stroke="${shade}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".9"/>
  <path d="M91 114q9 7 18 0" stroke="${beard ? '#F3D2C4' : '#B25C55'}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <circle cx="78" cy="107" r="6" fill="#F08A7A" opacity=".16"/><circle cx="122" cy="107" r="6" fill="#F08A7A" opacity=".16"/>
  ${glasses ? dibujarLentes() : ''}
</svg>`;
}
