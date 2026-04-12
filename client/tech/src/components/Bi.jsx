/** Bilingual text — English first, Spanish smaller below or after slash */
export function Bi({ en, es, className = '' }) {
  return (
    <span className={className}>
      {en} <span className="text-[0.85em] opacity-70">/ {es}</span>
    </span>
  )
}

/** Bilingual block — English on top, Spanish below in smaller text */
export function BiBlock({ en, es, className = '' }) {
  return (
    <span className={`${className} flex flex-col leading-tight`}>
      <span>{en}</span>
      <span className="text-[0.8em] opacity-70">{es}</span>
    </span>
  )
}

/** Status labels in English and Spanish */
export const STATUS_ES = {
  'Received': 'Recibido',
  'Acknowledged': 'Confirmado',
  'Scheduled': 'Programado',
  'Dispatched': 'En Camino',
  'On Site': 'En el Lugar',
  'Diagnosing': 'Diagnosticando',
  'In Progress': 'En Progreso',
  'Parts Ordered': 'Partes Ordenadas',
  'Parts Arrived': 'Partes Llegaron',
  'Complete': 'Completado',
  'Follow-Up Required': 'Seguimiento Requerido',
  'Cannot Repair': 'No Se Puede Reparar',
  'Cancelled': 'Cancelado',
}

/** Bilingual labels used across the tech app */
export const L = {
  signIn: ['Sign In', 'Iniciar Sesión'],
  signingIn: ['Signing In...', 'Iniciando...'],
  yourName: ['Your Name', 'Su Nombre'],
  selectName: ['Select your name', 'Seleccione su nombre'],
  pin: ['PIN', 'PIN'],
  pinPlaceholder: ['4-digit PIN', 'PIN de 4 dígitos'],
  myRequests: ['My Requests', 'Mis Solicitudes'],
  open: ['open', 'abiertas'],
  total: ['total', 'total'],
  noRequests: ['No requests assigned', 'No hay solicitudes asignadas'],
  loading: ['Loading...', 'Cargando...'],
  customer: ['Customer', 'Cliente'],
  company: ['Company', 'Compañía'],
  contact: ['Contact', 'Contacto'],
  phone: ['Phone', 'Teléfono'],
  siteAddress: ['Site Address', 'Dirección del Sitio'],
  equipment: ['Equipment', 'Equipo'],
  description: ['Description', 'Descripción'],
  assetNum: ['Asset #', 'Activo #'],
  problem: ['Problem', 'Problema'],
  unitNumber: ['Unit Number', 'Número de Unidad'],
  enterUnit: ['Enter unit number', 'Ingrese número de unidad'],
  save: ['Save', 'Guardar'],
  addNotes: ['Add Notes', 'Agregar Notas'],
  notesPlaceholder: ['Optional notes for this update...', 'Notas opcionales para esta actualización...'],
  etaPlaceholder: ['ETA (e.g., Between 2-4 PM)', 'Hora estimada (ej., Entre 2-4 PM)'],
  techNotes: ['Tech Notes', 'Notas del Técnico'],
  updateStatus: ['Update Status', 'Actualizar Estado'],
  markComplete: ['Mark Complete', 'Marcar Completado'],
  confirmComplete: ['Confirm Complete', 'Confirmar Completado'],
  completing: ['Completing...', 'Completando...'],
  cancel: ['Cancel', 'Cancelar'],
  notesRequired: ['Notes are required when marking complete', 'Las notas son requeridas al marcar completado'],
  notesLabel: ['Tech Notes', 'Notas del Técnico'],
  notesHint: ['Describe what was done, parts replaced, issue found...', 'Describa lo que se hizo, partes reemplazadas, problema encontrado...'],
  timeline: ['Timeline', 'Historial'],
  logout: ['Logout', 'Salir'],
  techPortal: ['Tech Portal', 'Portal de Técnicos'],
}

/** Helper to render a bilingual label pair */
export function bl(key) {
  const pair = L[key]
  if (!pair) return key
  return `${pair[0]} / ${pair[1]}`
}
