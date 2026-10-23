-- =============================================================================
-- Prakisama Works · Migración 14: número de factura en los gastos de la obra
--
-- Petición del usuario: poder apuntar el número de factura de cada gasto. Opcional (texto libre:
-- cada proveedor numera a su manera, con letras, barras, guiones...), sin restricción de unicidad
-- porque dos proveedores distintos pueden repetir número.
-- =============================================================================

alter table public.project_expenses add column invoice_number text;
