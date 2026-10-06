// Reference CDM of cases/quaera.md — the database of Quaera (quaera.app), the analyst trainer
// StrataSQL is part of. Not a trainer case: a finished model of a real analytics schema, opened
// from Examples → Real database or by the link https://model.quaera.app/?example=quaera.
// Ideas: a star schema (facts reference dimensions, never the other way), surrogate keys on the
// facts with the grain as an alternate key, two reflexive hierarchies, denormalised dimensions.
// Every table, column, key and NULL rule here was checked against Quaera's data (2026-10-06);
// where the generated PDM differs from Quaera's own column names, cases/quaera.md §5 says why.

import { CARD, emptyModel, type Model } from '../../core/metamodel'
import { addAttribute, addDomain, addEntity, addIdentifier, addPhysicalKey, addRelationship, updateEntity } from '../../core/ops'

export const QUAERA_URL = 'https://quaera.app'

export function buildQuaera(): Model {
  const m = emptyModel('Quaera: sales analytics')
  m.comment =
    'The database behind quaera.app: a distributor of FMCG and OTC pharma, Jan 2024 – Jun 2026. ' +
    'A star schema built for analysis: six fact tables (what happened, counted) around six dimensions (who, what, where, when). ' +
    'Query it with real data at quaera.app. ' +
    'Model check shows 3 cycle warnings and 1 hint: they are expected in a star schema and explained there.'

  const name = addDomain(m, { name: 'Name', dataType: 'Variable characters', length: 50 })
  const label = addDomain(m, { name: 'Label', dataType: 'Variable characters', length: 20 })
  const amount = addDomain(m, { name: 'Amount', dataType: 'Decimal', length: 12, precision: 2 })

  // ---------------------------------------------------------------- dimensions

  const calendar = addEntity(m, { name: 'Calendar', code: 'DIM_DATE', position: { x: 40, y: 40 } })
  addAttribute(m, calendar.id, { name: 'date_id', dataType: 'Date', primary: true })
  for (const [n, t] of [['year', 'Integer'], ['quarter', 'Short integer'], ['month', 'Short integer']] as const)
    addAttribute(m, calendar.id, { name: n, dataType: t, mandatory: true })
  addAttribute(m, calendar.id, { name: 'month_name', length: 9, mandatory: true })
  addAttribute(m, calendar.id, { name: 'month_start', dataType: 'Date', mandatory: true })
  addAttribute(m, calendar.id, { name: 'week_start', dataType: 'Date', mandatory: true })
  addAttribute(m, calendar.id, { name: 'iso_week', dataType: 'Short integer', mandatory: true })
  addAttribute(m, calendar.id, { name: 'day_of_week', dataType: 'Short integer', mandatory: true, comment: '1 = Monday' })
  addAttribute(m, calendar.id, { name: 'day_name', dataType: 'Characters', length: 3, mandatory: true })
  addAttribute(m, calendar.id, { name: 'is_weekend', dataType: 'Boolean', mandatory: true })
  updateEntity(m, calendar.id, {
    comment: 'One row per day. Every column after the key is derived from the date — stored on purpose: in an analytics schema the calendar is computed once so queries can group by month or week without date functions.',
  })

  const promo = addEntity(m, { name: 'Promo', code: 'DIM_PROMO', position: { x: 420, y: 40 } })
  addAttribute(m, promo.id, { name: 'promo_id', dataType: 'Integer', primary: true })
  addAttribute(m, promo.id, { name: 'promo_name', domainId: name.id, mandatory: true })
  addAttribute(m, promo.id, { name: 'brand', domainId: label.id, mandatory: true })
  addAttribute(m, promo.id, { name: 'mechanic', domainId: label.id, mandatory: true })
  addAttribute(m, promo.id, { name: 'start_date', dataType: 'Date', mandatory: true })
  addAttribute(m, promo.id, { name: 'end_date', dataType: 'Date', mandatory: true })
  addAttribute(m, promo.id, { name: 'discount_pct', dataType: 'Decimal', length: 5, precision: 2, mandatory: true })
  addAttribute(m, promo.id, { name: 'channel', domainId: label.id, mandatory: true, comment: "'all' = every channel" })

  const product = addEntity(m, { name: 'Product', code: 'DIM_PRODUCT', position: { x: 800, y: 400 } })
  addAttribute(m, product.id, { name: 'product_id', dataType: 'Integer', primary: true })
  const sku = addAttribute(m, product.id, { name: 'sku_code', length: 10, mandatory: true })
  addIdentifier(m, product.id, { name: 'sku_code', isPrimary: false, attributeIds: [sku.id] })
  addAttribute(m, product.id, { name: 'product_name', domainId: name.id, mandatory: true })
  for (const n of ['brand', 'category', 'subcategory', 'division'])
    addAttribute(m, product.id, { name: n, domainId: label.id, mandatory: true })
  addAttribute(m, product.id, { name: 'pack_size', dataType: 'Decimal', length: 7, precision: 3, mandatory: true })
  addAttribute(m, product.id, { name: 'unit', length: 10, mandatory: true })
  addAttribute(m, product.id, { name: 'list_price', domainId: amount.id, mandatory: true, comment: 'Base shelf price, ¥' })
  addAttribute(m, product.id, { name: 'launch_date', dataType: 'Date', mandatory: true })
  updateEntity(m, product.id, {
    comment: 'Brand, category, subcategory and division are repeated text, not lookup entities: a denormalised dimension. In an order-entry database they would be entities of their own; here one table per dimension keeps every query one join away from the facts.',
  })

  const region = addEntity(m, { name: 'Region', code: 'DIM_REGION', position: { x: 40, y: 760 } })
  addAttribute(m, region.id, { name: 'region_id', dataType: 'Integer', primary: true })
  addAttribute(m, region.id, { name: 'region_name', domainId: label.id, mandatory: true, comment: 'Prefecture' })
  addAttribute(m, region.id, { name: 'macro_region', domainId: label.id, mandatory: true })
  addAttribute(m, region.id, { name: 'population', dataType: 'Integer', mandatory: true })
  addAttribute(m, region.id, { name: 'tier', dataType: 'Short integer', mandatory: true, comment: '1 = key region … 3 = periphery' })

  const customer = addEntity(m, { name: 'Customer', code: 'DIM_CUSTOMER', position: { x: 420, y: 760 } })
  addAttribute(m, customer.id, { name: 'customer_id', dataType: 'Integer', primary: true })
  addAttribute(m, customer.id, { name: 'customer_name', domainId: name.id, mandatory: true })
  addAttribute(m, customer.id, { name: 'customer_type', domainId: label.id, mandatory: true, comment: 'distributor, chain, traditional, pharmacy, ecom' })
  addAttribute(m, customer.id, { name: 'channel', domainId: label.id, mandatory: true })
  addAttribute(m, customer.id, { name: 'chain_name', domainId: label.id, comment: 'Only for outlets of a chain' })
  addAttribute(m, customer.id, { name: 'city', domainId: label.id, mandatory: true })
  addAttribute(m, customer.id, { name: 'opened_date', dataType: 'Date', mandatory: true })
  addAttribute(m, customer.id, { name: 'is_active', dataType: 'Boolean', mandatory: true })
  updateEntity(m, customer.id, {
    comment: 'Distributors and the outlets they serve are both customers: an outlet points to its distributor through the reflexive relationship supplies.',
  })

  const rep = addEntity(m, { name: 'Sales Rep', code: 'DIM_REP', position: { x: 40, y: 1120 } })
  addAttribute(m, rep.id, { name: 'rep_id', dataType: 'Integer', primary: true })
  addAttribute(m, rep.id, { name: 'rep_name', domainId: name.id, mandatory: true })
  addAttribute(m, rep.id, { name: 'team', domainId: label.id, mandatory: true })
  addAttribute(m, rep.id, { name: 'role', length: 10, mandatory: true, comment: 'manager or rep' })
  addAttribute(m, rep.id, { name: 'hired_date', dataType: 'Date', mandatory: true })

  // ---------------------------------------------------------------- facts
  // Each fact has a surrogate key (`*_id`) and its grain — the columns that say what one row is —
  // as an alternate key over the PDM columns, so the database refuses a second row for the same grain.

  const sellout = addEntity(m, { name: 'Sell-out', code: 'FACT_SELLOUT', position: { x: 420, y: 400 } })
  addAttribute(m, sellout.id, { name: 'sellout_id', dataType: 'Integer', primary: true })
  addAttribute(m, sellout.id, { name: 'units', dataType: 'Integer', mandatory: true })
  addAttribute(m, sellout.id, { name: 'revenue', domainId: amount.id, mandatory: true })
  addAttribute(m, sellout.id, { name: 'avg_price', domainId: amount.id, mandatory: true, comment: 'revenue / units: derived, stored for convenience' })
  updateEntity(m, sellout.id, { comment: 'Sales at outlets. Grain: week × outlet × product. The week is the Calendar row of its Monday.' })

  const sellin = addEntity(m, { name: 'Sell-in', code: 'FACT_SELLIN', position: { x: 1180, y: 400 } })
  addAttribute(m, sellin.id, { name: 'sellin_id', dataType: 'Integer', primary: true })
  addAttribute(m, sellin.id, { name: 'order_date', dataType: 'Date', mandatory: true })
  addAttribute(m, sellin.id, { name: 'ship_date', dataType: 'Date', mandatory: true, comment: '2–11 days after the order' })
  addAttribute(m, sellin.id, { name: 'month_start', dataType: 'Date', mandatory: true, comment: 'Month of order_date: derived, stored for grouping' })
  addAttribute(m, sellin.id, { name: 'units', dataType: 'Integer', mandatory: true })
  addAttribute(m, sellin.id, { name: 'gross_amount', domainId: amount.id, mandatory: true })
  addAttribute(m, sellin.id, { name: 'discount_amount', domainId: amount.id, mandatory: true })
  addAttribute(m, sellin.id, { name: 'net_amount', domainId: amount.id, mandatory: true, comment: 'gross_amount − discount_amount: derived, stored' })
  updateEntity(m, sellin.id, { comment: 'Shipments to distributors. Grain: month × distributor × product.' })

  const stock = addEntity(m, { name: 'Stock', code: 'FACT_STOCK', position: { x: 800, y: 760 } })
  addAttribute(m, stock.id, { name: 'stock_id', dataType: 'Integer', primary: true })
  addAttribute(m, stock.id, { name: 'month_start', dataType: 'Date', mandatory: true })
  addAttribute(m, stock.id, { name: 'month_end', dataType: 'Date', mandatory: true })
  addAttribute(m, stock.id, { name: 'units_on_hand', dataType: 'Integer', mandatory: true })
  addAttribute(m, stock.id, { name: 'units_in_transit', dataType: 'Integer', mandatory: true })
  updateEntity(m, stock.id, { comment: 'Distributor stock at month end. Grain: month × distributor × product. A snapshot: units on hand do not add up across months.' })

  const target = addEntity(m, { name: 'Target', code: 'FACT_TARGET', position: { x: 420, y: 1120 } })
  addAttribute(m, target.id, { name: 'target_id', dataType: 'Integer', primary: true })
  addAttribute(m, target.id, { name: 'month_start', dataType: 'Date', mandatory: true })
  addAttribute(m, target.id, { name: 'division', domainId: label.id, mandatory: true, comment: 'FMCG or Pharma' })
  addAttribute(m, target.id, { name: 'target_units', dataType: 'Integer', mandatory: true })
  addAttribute(m, target.id, { name: 'target_revenue', domainId: amount.id, mandatory: true })
  updateEntity(m, target.id, { comment: 'Sales targets. Grain: month × rep × division.' })

  const forecast = addEntity(m, { name: 'Forecast Snapshot', code: 'FACT_FORECAST_SNAPSHOT', position: { x: 800, y: 40 } })
  addAttribute(m, forecast.id, { name: 'forecast_id', dataType: 'Integer', primary: true })
  addAttribute(m, forecast.id, { name: 'snapshot_month', dataType: 'Date', mandatory: true, comment: 'When the forecast was made' })
  addAttribute(m, forecast.id, { name: 'month_start', dataType: 'Date', mandatory: true, comment: 'The month it is for' })
  addAttribute(m, forecast.id, { name: 'lag_months', dataType: 'Short integer', mandatory: true, comment: '1, 2 or 3 months ahead' })
  addAttribute(m, forecast.id, { name: 'forecast_units', dataType: 'Integer', mandatory: true })
  updateEntity(m, forecast.id, { comment: 'Demand forecasts kept as made, never overwritten. Grain: forecast month × target month × product.' })

  const price = addEntity(m, { name: 'Price', code: 'FACT_PRICE', position: { x: 1180, y: 40 } })
  addAttribute(m, price.id, { name: 'price_id', dataType: 'Integer', primary: true })
  addAttribute(m, price.id, { name: 'month_start', dataType: 'Date', mandatory: true })
  addAttribute(m, price.id, { name: 'list_price', domainId: amount.id, mandatory: true })
  addAttribute(m, price.id, { name: 'promo_price', domainId: amount.id, mandatory: true })
  updateEntity(m, price.id, { comment: 'Monthly price list. Grain: month × product. Product.list_price is today’s price; this keeps the history.' })

  // ---------------------------------------------------------------- relationships
  // A is the "one" end (1,1 unless optional), B the "many" end (0,n): the FK goes into B.

  addRelationship(m, region.id, customer.id, { name: 'located_in' })
  addRelationship(m, region.id, rep.id, { name: 'based_in' })
  addRelationship(m, rep.id, customer.id, { name: 'serves', cardinalityA: CARD.zeroOne, comment: 'Distributors have no rep' })
  addRelationship(m, customer.id, customer.id, {
    name: 'supplies',
    cardinalityA: CARD.zeroOne,
    roleA: 'distributor',
    roleB: 'outlet',
    comment: 'An outlet is served by at most one distributor; distributors themselves have none',
  })
  addRelationship(m, rep.id, rep.id, { name: 'manages', cardinalityA: CARD.zeroOne, roleA: 'manager', roleB: 'team_member' })

  addRelationship(m, calendar.id, sellout.id, { name: 'week_of' })
  addRelationship(m, customer.id, sellout.id, { name: 'sells' })
  addRelationship(m, product.id, sellout.id, { name: 'sold_as' })
  addRelationship(m, promo.id, sellout.id, { name: 'promoted_by', cardinalityA: CARD.zeroOne, comment: 'Most weeks sell without a promotion' })
  addRelationship(m, customer.id, sellin.id, { name: 'buys', comment: 'Only customers of type distributor' })
  addRelationship(m, product.id, sellin.id, { name: 'shipped_as' })
  addRelationship(m, customer.id, stock.id, { name: 'holds', comment: 'Only customers of type distributor' })
  addRelationship(m, product.id, stock.id, { name: 'stocked_as' })
  addRelationship(m, rep.id, target.id, { name: 'aims_for' })
  addRelationship(m, product.id, forecast.id, { name: 'forecast_for' })
  addRelationship(m, product.id, price.id, { name: 'priced_at' })

  // ---------------------------------------------------------------- grain = alternate key
  addPhysicalKey(m, sellout.id, { name: 'AK_SELLOUT_GRAIN', columns: ['date_id', 'customer_id', 'product_id'] })
  addPhysicalKey(m, sellin.id, { name: 'AK_SELLIN_GRAIN', columns: ['month_start', 'customer_id', 'product_id'] })
  addPhysicalKey(m, stock.id, { name: 'AK_STOCK_GRAIN', columns: ['month_start', 'customer_id', 'product_id'] })
  addPhysicalKey(m, target.id, { name: 'AK_TARGET_GRAIN', columns: ['month_start', 'rep_id', 'division'] })
  addPhysicalKey(m, forecast.id, { name: 'AK_FORECAST_GRAIN', columns: ['snapshot_month', 'month_start', 'product_id'] })
  addPhysicalKey(m, price.id, { name: 'AK_PRICE_GRAIN', columns: ['month_start', 'product_id'] })

  return m
}
