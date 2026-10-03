// Reference CDM of cases/online-shop.md — own example, difficulty 2.
// Ideas: a dependent entity with a line number (Order Line), a reflexive relationship with roles
// (category tree), a one-to-one (Order — Payment), a price copied at order time (history, not
// derived) and a total that is derived (not stored). `Order` is a reserved SQL word, hence Customer Order.

import { CARD, emptyModel, type Model } from '../../core/metamodel'
import { addAttribute, addDomain, addEntity, addIdentifier, addRelationship, updateEntity } from '../../core/ops'

export function buildOnlineShop(): Model {
  const m = emptyModel('Online Shop')
  m.comment = 'Own case (cases/online-shop.md): customers, a category tree, products, orders with lines, payments.'

  const name = addDomain(m, { name: 'Name', dataType: 'Variable characters', length: 100 })
  const money = addDomain(m, { name: 'Amount', dataType: 'Decimal', length: 10, precision: 2 })

  const customer = addEntity(m, { name: 'Customer', position: { x: 40, y: 340 } })
  addAttribute(m, customer.id, { name: 'customer_no', dataType: 'Integer', primary: true })
  addAttribute(m, customer.id, { name: 'name', domainId: name.id, mandatory: true })
  const email = addAttribute(m, customer.id, { name: 'email', length: 100, mandatory: true })
  addIdentifier(m, customer.id, { name: 'email', isPrimary: false, attributeIds: [email.id] })

  const category = addEntity(m, { name: 'Category', position: { x: 40, y: 40 } })
  addAttribute(m, category.id, { name: 'category_id', dataType: 'Integer', primary: true })
  addAttribute(m, category.id, { name: 'name', length: 50, mandatory: true })

  const product = addEntity(m, { name: 'Product', position: { x: 420, y: 40 } })
  addAttribute(m, product.id, { name: 'product_id', dataType: 'Integer', primary: true })
  const sku = addAttribute(m, product.id, { name: 'sku', length: 20, mandatory: true })
  addIdentifier(m, product.id, { name: 'sku', isPrimary: false, attributeIds: [sku.id] })
  addAttribute(m, product.id, { name: 'name', domainId: name.id, mandatory: true })
  addAttribute(m, product.id, { name: 'price', domainId: money.id, mandatory: true })
  addAttribute(m, product.id, { name: 'stock', dataType: 'Integer', mandatory: true })

  const order = addEntity(m, { name: 'Customer Order', position: { x: 420, y: 340 } })
  addAttribute(m, order.id, { name: 'order_no', dataType: 'Integer', primary: true })
  addAttribute(m, order.id, { name: 'order_date', dataType: 'Date', mandatory: true })
  updateEntity(m, order.id, { comment: 'ORDER is a reserved word in SQL, so the entity is named Customer Order.' })

  const line = addEntity(m, { name: 'Order Line', position: { x: 800, y: 190 } })
  addAttribute(m, line.id, { name: 'line_no', dataType: 'Short integer', primary: true })
  addAttribute(m, line.id, { name: 'quantity', dataType: 'Integer', mandatory: true })
  addAttribute(m, line.id, { name: 'unit_price', domainId: money.id, mandatory: true, comment: 'The price paid: product prices change later' })
  updateEntity(m, line.id, { comment: 'Identified by its order and a line number.' })

  const payment = addEntity(m, { name: 'Payment', position: { x: 420, y: 600 } })
  addAttribute(m, payment.id, { name: 'payment_id', dataType: 'Integer', primary: true })
  addAttribute(m, payment.id, { name: 'paid_on', dataType: 'Date', mandatory: true })
  addAttribute(m, payment.id, { name: 'method', length: 20, mandatory: true })
  addAttribute(m, payment.id, { name: 'amount', domainId: money.id, mandatory: true })

  addRelationship(m, category.id, product.id, { name: 'classifies' })
  addRelationship(m, category.id, category.id, { name: 'subcategory_of', cardinalityA: CARD.zeroOne, cardinalityB: CARD.zeroMany, roleA: 'parent', roleB: 'sub' })
  addRelationship(m, customer.id, order.id, { name: 'places' })
  addRelationship(m, order.id, line.id, { name: 'has_lines', cardinalityB: CARD.oneMany, dependentSide: 'B' })
  addRelationship(m, product.id, line.id, { name: 'ordered_as' })
  addRelationship(m, order.id, payment.id, { name: 'paid_by', cardinalityB: CARD.zeroOne })

  return m
}
