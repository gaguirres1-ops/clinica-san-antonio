const rutas = new Map();
const oyentesDeCambio = new Set();

let contenedorVista = null;
let obtenerContexto = () => ({});
let rutaPorDefecto = 'inicio';
let desmontarVistaActual = null;

export function registrarRutas(definiciones) {
  definiciones.forEach((definicion) => {
    if (!definicion?.id || typeof definicion.montar !== 'function') {
      throw new Error('Cada módulo debe exportar un objeto con "id" y "montar".');
    }
    if (rutas.has(definicion.id)) throw new Error(`La ruta "${definicion.id}" ya fue registrada.`);
    rutas.set(definicion.id, { menu: true, roles: [], ...definicion });
  });
}

export function construirHash(id, params = {}) {
  const consulta = new URLSearchParams(
    Object.entries(params).filter(([, valor]) => valor !== undefined && valor !== null && valor !== ''),
  ).toString();
  return `#/${id}${consulta ? `?${consulta}` : ''}`;
}

export function leerRutaActual() {
  const [ruta, consulta = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { id: ruta || rutaPorDefecto, params: Object.fromEntries(new URLSearchParams(consulta)) };
}

export function navegar(id, params = {}) {
  const destino = construirHash(id, params);
  if (location.hash === destino) {
    refrescarVista();
    return;
  }
  location.hash = destino;
}

export function puedeAcceder(id, rol) {
  return Boolean(rutas.get(id)?.roles.includes(rol));
}

export function obtenerRuta(id) {
  return rutas.get(id) ?? null;
}

export function rutasDelMenu(rol) {
  return [...rutas.values()].filter((ruta) => ruta.menu && ruta.roles.includes(rol));
}

export function alCambiarRuta(oyente) {
  oyentesDeCambio.add(oyente);
  return () => oyentesDeCambio.delete(oyente);
}

function renderizarErrorDeMontaje(raiz, ruta, error) {
  console.error(`Error al montar "${ruta.id}":`, error);
  raiz.innerHTML = `
    <section class="panel">
      <div class="aviso aviso--peligro">
        <div><strong>No se pudo cargar "${ruta.titulo}".</strong>Revisa la consola del navegador para más detalles.</div>
      </div>
    </section>`;
}

export function refrescarVista() {
  const { id, params } = leerRutaActual();
  const contexto = obtenerContexto();
  const ruta = rutas.get(id);

  if (!ruta || !ruta.roles.includes(contexto.rol)) {
    if (id === rutaPorDefecto) throw new Error(`La ruta por defecto "${rutaPorDefecto}" no está disponible para el rol "${contexto.rol}".`);
    history.replaceState(null, '', construirHash(rutaPorDefecto));
    refrescarVista();
    return;
  }

  desmontarVistaActual?.();
  desmontarVistaActual = null;

  const raiz = document.createElement('div');
  raiz.className = 'vista__contenido';
  contenedorVista.replaceChildren(raiz);

  try {
    const desmontar = ruta.montar(raiz, { ...contexto, params, navegar });
    desmontarVistaActual = typeof desmontar === 'function' ? desmontar : null;
  } catch (error) {
    renderizarErrorDeMontaje(raiz, ruta, error);
  }

  document.title = `${ruta.titulo} · Clínica San Antonio`;
  window.scrollTo({ top: 0 });
  contenedorVista.focus({ preventScroll: true });
  oyentesDeCambio.forEach((oyente) => oyente(ruta));
}

export function iniciarNavegacion({ contenedor, contexto, rutaInicial = 'inicio' }) {
  contenedorVista = contenedor;
  obtenerContexto = contexto;
  rutaPorDefecto = rutaInicial;
  window.addEventListener('hashchange', refrescarVista);
  refrescarVista();
}
