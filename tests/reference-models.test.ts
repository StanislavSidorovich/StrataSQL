// Reference models of real databases (cases/quaera.md): the PDM listed in §5, the linter
// issues explained in §6, and DDL without generation warnings.

import { describe, expect, it } from 'vitest'
import { generatePdm } from '../src/core/cdm2pdm'
import { generateSqlServer } from '../src/core/ddl/sqlserver'
import { lintModel } from '../src/core/lint'
import { buildQuaera } from '../src/data/examples/quaera'
import { REFERENCE_MODELS, referenceModelById, referenceModelOf } from '../src/data/reference-models'

describe('Quaera reference model', () => {
  const pdm = generatePdm(buildQuaera())

  it('generates the PDM of cases/quaera.md §5', () => {
    expect(
      pdm.tables.map(
        (t) =>
          `${t.name}: ${t.primaryKey?.columns.join(',')}` +
          (t.foreignKeys.length ? ` → ${t.foreignKeys.map((f) => `${f.refTable}(${f.columns.join(',')})`).join(', ')}` : '') +
          (t.alternateKeys.length ? ` | AK ${t.alternateKeys.map((k) => k.columns.join(',')).join('; ')}` : ''),
      ),
    ).toEqual([
      'DIM_DATE: date_id',
      'DIM_PROMO: promo_id',
      'DIM_PRODUCT: product_id | AK sku_code',
      'DIM_REGION: region_id',
      'DIM_CUSTOMER: customer_id → DIM_REGION(region_id), DIM_REP(rep_id), DIM_CUSTOMER(distributor_customer_id)',
      'DIM_REP: rep_id → DIM_REGION(region_id), DIM_REP(manager_rep_id)',
      'FACT_SELLOUT: sellout_id → DIM_DATE(date_id), DIM_CUSTOMER(customer_id), DIM_PRODUCT(product_id), DIM_PROMO(promo_id) | AK date_id,customer_id,product_id',
      'FACT_SELLIN: sellin_id → DIM_CUSTOMER(customer_id), DIM_PRODUCT(product_id) | AK month_start,customer_id,product_id',
      'FACT_STOCK: stock_id → DIM_CUSTOMER(customer_id), DIM_PRODUCT(product_id) | AK month_start,customer_id,product_id',
      'FACT_TARGET: target_id → DIM_REP(rep_id) | AK month_start,rep_id,division',
      'FACT_FORECAST_SNAPSHOT: forecast_id → DIM_PRODUCT(product_id) | AK snapshot_month,month_start,product_id',
      'FACT_PRICE: price_id → DIM_PRODUCT(product_id) | AK month_start,product_id',
    ])
  })

  it('nullable FKs are exactly the optional links of Quaera’s data', () => {
    const nullable = pdm.tables.flatMap((t) => t.columns.filter((c) => c.nullable).map((c) => `${t.name}.${c.name}`))
    expect(nullable).toEqual(['DIM_CUSTOMER.rep_id', 'DIM_CUSTOMER.distributor_customer_id', 'DIM_CUSTOMER.chain_name', 'DIM_REP.manager_rep_id', 'FACT_SELLOUT.promo_id'])
  })

  it('lints with only the issues explained in §6: three star-schema cycles and the stored average', () => {
    expect(lintModel(buildQuaera()).map((i) => `${i.rule} ${i.severity}`)).toEqual(['L04 warning', 'L04 warning', 'L04 warning', expect.stringMatching(/ info$/)])
  })

  it('SQL Server DDL without generation warnings', () => {
    expect(pdm.notes.filter((n) => n.level === 'warning')).toEqual([])
    expect(generateSqlServer(pdm).match(/CREATE TABLE/g)).toHaveLength(12)
  })

  it('is found by its link id and by the name of an opened copy', () => {
    expect(referenceModelById('quaera')?.title).toMatch(/Quaera/)
    expect(referenceModelById('nope')).toBeUndefined()
    expect(referenceModelById(null)).toBeUndefined()
    expect(referenceModelOf(buildQuaera())).toBe(REFERENCE_MODELS[0])
    expect(referenceModelOf({ ...buildQuaera(), name: 'My copy' })).toBeUndefined()
  })
})
