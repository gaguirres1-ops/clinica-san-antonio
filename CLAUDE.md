# Sistema de Gestión de Citas – Clínica San Antonio

Frontend estático en HTML5, CSS3 y JavaScript Vanilla (ES6+ con módulos nativos). Sin frameworks ni dependencias de build. Se despliega en Vercel con `frontend/` como *Root Directory*.

## Ejecutar en local

Los módulos ES no cargan con `file://`. Sirve la carpeta `frontend/` con un servidor estático:

```bash
npx serve frontend
```

o con la extensión **Live Server** de VS Code abriendo `frontend/index.html`.

El botón **Restablecer datos** del menú lateral vuelve a generar los datos de `mockData.js` en `localStorage`.

## Reglas de código limpio (obligatorias)

- **Prohibidos los comentarios** explicativos, de relleno, banners decorativos (`/* ==== */`), código comentado y `TODO` sueltos en HTML, CSS y JS.
- Solo se permite un comentario cuando documenta una restricción técnica crítica que no se deduce del código.
- El código se explica con nombres: funciones con verbo (`renderizarPaso`, `confirmarReserva`), variables descriptivas (`horarioSeleccionado`, no `h` ni `tmp`), clases CSS en BEM en español (`tarjeta-medico__nombre`, `boton--primario`).
- Identificadores, textos de interfaz y mensajes de commit en español.
- Sin `var`; `const` por defecto, `let` solo si hay reasignación. Sin variables globales en `window`.
- Funciones cortas y de una sola responsabilidad. Evitar duplicar lógica que ya exista en `core/`.
- Todo texto que provenga de datos se interpola con `escaparHtml()`.
- Nada de estilos en línea ni `<style>` dentro de los módulos: los estilos van en `css/modules.css` (o `css/global.css` si son del shell).
- Antes de abrir un PR, el módulo debe funcionar en los tres roles sin errores en consola.

## Estructura

```
frontend/
  index.html               Shell: barra superior, selector de rol, notificaciones, menú lateral
  css/global.css           Tokens de diseño, shell, botones, formularios, insignias, modales, toasts
  css/modules.css          Estilos de vistas y casos de uso
  js/main.js               Arranque: registra rutas y renderiza el shell
  js/core/storage.js       CRUD sobre localStorage, transacciones y suscripciones
  js/core/navigation.js    Enrutador por hash (#/ruta?param=valor) y control de acceso por rol
  js/core/dominio.js       Reglas compartidas: estados, horarios, notificaciones, citas detalladas
  js/core/ui.js            Íconos, insignias, stepper, modales, confirmaciones, toasts, filas de cita
  js/core/fechas.js        Utilidades de fecha y formato es-PE
  js/core/inicio.js        Panel de inicio por rol
  js/core/detalleCita.js   Vista compartida de detalle de cita (#/detalle-cita?id=CIT-0001)
  js/data/mockData.js      Datos iniciales (especialidades, médicos, pacientes, horarios, citas, pagos, historial)
  js/modules/*.js          Un archivo por caso de uso
database/                  Modelo de base de datos (scripts SQL, diagramas)
backend/                   Reservado para la API
```

## Propiedad de archivos

| Integrante | Archivos |
|---|---|
| **Glidis** | Base del proyecto (`index.html`, `css/*`, `js/main.js`, `js/core/*`, `js/data/mockData.js`, `CLAUDE.md`) y `js/modules/reservarCita.js` (CU-01) |
| **Diego** | `js/modules/reprogramarCita.js` y `js/modules/cancelarCita.js` |
| **Pool / Jean** | `js/modules/diagnostico.js`, `js/modules/gestionarAgenda.js` y la carpeta `database/` |
| **Susana** | `js/modules/reasignarMedico.js` |

- Cada integrante modifica solo sus archivos. Cualquier cambio en archivos base (`core/`, `main.js`, `mockData.js`, CSS) se coordina con Glidis en un PR aparte.
- Los estilos nuevos de un módulo se añaden en `css/modules.css` dentro de un bloque propio con prefijo del módulo (por ejemplo `.cancelacion__…`), siempre al final del archivo para minimizar conflictos.
- Ramas: `feature/<caso-de-uso>` (por ejemplo `feature/cancelar-cita`). PR hacia `main` con al menos una revisión.

## Contrato de un módulo

Cada archivo de `js/modules/` exporta por defecto un objeto:

```js
export default {
  id: 'cancelar-cita',
  titulo: 'Cancelar cita',
  icono: 'cancelar',
  roles: ['paciente', 'administrador'],
  seccion: 'Citas',
  montar(contenedor, contexto) {
    return () => {};
  },
};
```

- `montar` recibe un contenedor vacío y `contexto = { rol, sesion, usuario, params, navegar }`. `params` son los parámetros del hash (`?cita=CIT-0003`).
- Si se suscribe a `storage`, debe devolver la función de limpieza (`return storage.suscribir(...)`).
- Usar delegación de eventos con atributos `data-accion` sobre el contenedor.
- Navegar con `contexto.navegar('detalle-cita', { id })` o enlaces generados con `construirHash()`.

## Datos y persistencia

- `storage.js` expone: `obtenerTodos`, `filtrar`, `buscar`, `obtenerPorId`, `insertar`, `actualizar`, `eliminar`, `ejecutarTransaccion`, `suscribir`, `restablecer`, `obtenerSesion`, `guardarSesion`.
- Colecciones: `especialidades`, `medicos`, `pacientes`, `administradores`, `horarios`, `citas`, `pagos`, `historialClinico`, `notificaciones`.
- Operaciones que tocan varias colecciones van dentro de `ejecutarTransaccion` para revertir todo si algo falla.
- Estados de cita (`ESTADOS_CITA` en `dominio.js`): `Pendiente de pago`, `Confirmada`, `Reprogramada`, `Atendida`, `Cancelada`.
- Estados de horario (`ESTADOS_HORARIO`): `disponible`, `ocupado`, `bloqueado`. Usar `ocuparHorario` / `liberarHorario` de `dominio.js`.
- Notificar a los actores con `notificar({ destinatarioRol, destinatarioId, titulo, mensaje, citaId })`.
- Los cambios se sincronizan entre pestañas mediante el evento `storage` del navegador.

## Diseño

- Paleta azul noche: `--color-noche #0F172A`, `--color-azul #1E3A8A`, fondo `#F8FAFC`. Usar siempre los tokens de `:root`.
- Tipografías: Inter (texto) y Poppins (títulos).
- Estados de cita con `insigniaEstado(estado)`; acciones destructivas con `confirmarAccion({ peligro: true })`.
