// Constantes de dominio. Los códigos van en inglés/ASCII (son los que se guardan en la BD);
// las etiquetas, en español.

/**
 * Checklist fijo de documentación/hitos de la obra, en el orden en que se van dando normalmente.
 * El aval NO está aquí: se lleva como producto bancario vinculado a la obra (ver "Aval" en la
 * ficha de la obra y `bank_products.project_id`), porque tiene banco, importe, periodo de
 * garantía y solicitud de devolución — más de lo que da de sí una fecha suelta.
 */
export const MILESTONE_KINDS = {
  contrato: 'Contrato',
  plan_seguridad: 'Plan de seguridad',
  acta_aprobacion_ps: 'Acta de aprobación del plan de seguridad',
  comunicacion_apertura: 'Comunicación de apertura',
  libro_subcontratacion: 'Libro de subcontratación',
  acta_replanteo: 'Acta de replanteo',
  recepcion_obra: 'Recepción de la obra',
};
