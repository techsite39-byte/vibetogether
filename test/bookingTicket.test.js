import assert from 'node:assert/strict'
import { test } from 'node:test'
import { downloadBookingTicket } from '../src/utils/bookingTicket.js'

test('downloaded paid booking tickets include the verified amount', async () => {
  const originalDocument = globalThis.document
  const originalWindow = globalThis.window
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  let ticketBlob

  globalThis.document = {
    body: { append() {} },
    createElement() {
      return { click() {}, remove() {} }
    },
  }
  globalThis.window = { setTimeout() {} }
  URL.createObjectURL = (blob) => {
    ticketBlob = blob
    return 'blob:booking-ticket'
  }
  URL.revokeObjectURL = () => {}

  try {
    downloadBookingTicket({
      reference: '10812026501',
      event: { title: 'Vibe Together', date: '', time: '', location: '' },
      attendee: { fullName: 'Jordan Example', email: '', mobile: '' },
      ticketCount: 3,
      paymentStatus: 'paid',
      paymentAmount: 199,
      total: 199,
      currency: 'INR',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    })

    assert.match(await ticketBlob.text(), /Amount paid: ₹199 INR/)
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  }
})
