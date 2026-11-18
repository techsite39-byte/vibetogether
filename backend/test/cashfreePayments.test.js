import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { describe, it } from 'node:test'
import {
  createCashfreePaymentService as createCashfreePaymentServiceImpl,
  isValidCashfreeWebhookSignature,
  resolveCashfreeReturnUrl,
} from '../src/services/cashfreePayments.js'
import { createMockBookingResultModel } from './bookingResultMocks.js'

function createCashfreePaymentService(options = {}) {
  return createCashfreePaymentServiceImpl({
    bookingResultModel: createMockBookingResultModel(),
    ...options,
  })
}

describe('Cashfree Payments Integration', () => {
  const testAppId = '1527714905b6600c9e88011fc744177251'
  const testSecretKey = 'cashfree-webhook-test-secret'

  function createMockEnquiry(initial = {}) {
    const doc = {
      requestId: 'req_test_001',
      name: 'John Doe',
      mobile: '9876543210',
      email: 'john@example.com',
      category: 'Strangers Meet',
      event: 'Sunset Jam',
      gender: 'Male',
      maleCount: 1,
      femaleCount: 0,
      ticketType: 'general-admission',
      ticketTypeName: 'General Admission',
      ticketQuantity: 1,
      regularPrice: 299,
      offerPrice: 249,
      paymentAmount: 249,
      paymentStatus: 'unpaid',
      status: 'pending',
      paymentOrders: [],
      ...initial,
      async save() {
        return this
      },
    }
    return doc
  }

  describe('resolveCashfreeReturnUrl validation & HTTPS enforcement', () => {
    it('rejects localhost HTTP URLs and replaces them with configured HTTPS FRONTEND_URL', () => {
      const invalidUrl = 'http://localhost:5173/booking/payment/req_test_001?order_id={order_id}'
      const resolved = resolveCashfreeReturnUrl({
        requestedUrl: invalidUrl,
        frontendUrl: 'https://www.vibetogether.show',
        requestId: 'req_test_001',
      })
      assert.equal(
        resolved,
        'https://www.vibetogether.show/booking/payment/req_test_001?order_id={order_id}',
      )
      assert.equal(resolved.startsWith('https://'), true)
      assert.equal(resolved.includes('req_test_001'), true)
      assert.equal(resolved.includes('{order_id}'), true)
    })

    it('rejects 127.0.0.1 and plain http URLs', () => {
      const httpUrl = 'http://127.0.0.1:4000/booking/payment/req_abc?order_id={order_id}'
      const resolved = resolveCashfreeReturnUrl({
        requestedUrl: httpUrl,
        frontendUrl: 'https://www.vibetogether.show',
        requestId: 'req_abc',
      })
      assert.equal(
        resolved,
        'https://www.vibetogether.show/booking/payment/req_abc?order_id={order_id}',
      )
      assert.equal(resolved.startsWith('https://'), true)
    })

    it('supports local development HTTPS tunnels (e.g. ngrok or Cloudflare Tunnel)', () => {
      const tunnelUrl = 'https://vibe-dev.ngrok-free.app/booking/payment/req_tunnel_123?order_id={order_id}'
      const resolved = resolveCashfreeReturnUrl({
        requestedUrl: tunnelUrl,
        frontendUrl: 'https://www.vibetogether.show',
        requestId: 'req_tunnel_123',
      })
      assert.equal(resolved, tunnelUrl)
      assert.equal(resolved.startsWith('https://'), true)
    })

    it('preserves the bookingId and adds {order_id} placeholder if omitted', () => {
      const secureUrl = 'https://custom.vibetogether.show/booking/payment/req_special'
      const resolved = resolveCashfreeReturnUrl({
        requestedUrl: secureUrl,
        frontendUrl: 'https://www.vibetogether.show',
        requestId: 'req_special',
      })
      assert.equal(
        resolved,
        'https://custom.vibetogether.show/booking/payment/req_special?order_id={order_id}',
      )
    })

    it('generates HTTPS return URL from FRONTEND_URL when requestedUrl is empty', () => {
      const resolved = resolveCashfreeReturnUrl({
        requestedUrl: '',
        frontendUrl: 'https://www.vibetogether.show',
        requestId: 'req_fallback_456',
      })
      assert.equal(
        resolved,
        'https://www.vibetogether.show/booking/payment/req_fallback_456?order_id={order_id}',
      )
      assert.equal(resolved.startsWith('https://'), true)
    })
  })

  describe('Cashfree webhook signature validation', () => {
    it('validates Cashfree webhook signature correctly using HMAC-SHA256 Base64', () => {
      const rawBody = JSON.stringify({
        data: {
          order: { order_id: 'VT_order_1' },
          payment: { cf_payment_id: 998877, payment_status: 'SUCCESS' },
        },
        type: 'PAYMENT_SUCCESS_WEBHOOK',
      })
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const expectedSig = createHmac('sha256', testSecretKey)
        .update(timestamp + rawBody)
        .digest('base64')

      // Valid signature
      assert.equal(
        isValidCashfreeWebhookSignature(rawBody, expectedSig, timestamp, testSecretKey),
        true,
      )
      assert.equal(
        isValidCashfreeWebhookSignature(rawBody, expectedSig, 'invalid-timestamp', testSecretKey),
        false,
      )
      assert.equal(
        isValidCashfreeWebhookSignature(rawBody, `${expectedSig}!`, timestamp, testSecretKey),
        false,
      )

      // Invalid signature
      assert.equal(
        isValidCashfreeWebhookSignature(rawBody, 'invalid-signature', timestamp, testSecretKey),
        false,
      )

      // Replay attack / Expired timestamp (> 10 minutes old)
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 700).toString()
      const oldSig = createHmac('sha256', testSecretKey)
        .update(oldTimestamp + rawBody)
        .digest('base64')
      assert.equal(
        isValidCashfreeWebhookSignature(rawBody, oldSig, oldTimestamp, testSecretKey),
        false,
      )
    })
  })

  describe('Production Cashfree order creation & HTTPS return_url', () => {
    it('creates Production Cashfree order with HTTPS return_url and rejects localhost', async () => {
      const enquiry = createMockEnquiry({
        requestId: 'req_prod_booking_789',
        categoryId: 'fun-games',
        ticketQuantity: 3,
      })
      let capturedUrl = ''
      let capturedHeaders = {}
      let capturedBody = null

      const mockFetch = async (url, options) => {
        capturedUrl = url
        capturedHeaders = options.headers
        capturedBody = JSON.parse(options.body)
        return {
          ok: true,
          json: async () => ({
            cf_order_id: 'cf_order_prod_999888',
            order_id: capturedBody.order_id,
            payment_session_id: 'session_token_prod_xyz123',
            order_amount: 597,
            order_currency: 'INR',
            order_status: 'ACTIVE',
          }),
        }
      }

      const mockModel = {
        async findOne({ requestId }) {
          if (requestId === enquiry.requestId) return enquiry
          return null
        },
      }

      const service = createCashfreePaymentService({
        appId: testAppId,
        secretKey: testSecretKey,
        environment: 'PRODUCTION',
        frontendUrl: 'https://www.vibetogether.show',
        bookingEnquiryModel: mockModel,
        diwaliOfferService: {
          async getPricing() {
            return {
              regularPrice: 299,
              offerPrice: 249,
              diwaliOfferApplied: true,
            }
          },
        },
        fetchFn: mockFetch,
      })

      // Client erroneously sent localhost HTTP URL
      const result = await service.createOrder(enquiry.requestId, {
        returnUrl: 'http://localhost:5173/booking/payment/req_prod_booking_789?order_id={order_id}',
      })

      assert.equal(result.cf_order_id, 'cf_order_prod_999888')
      assert.equal(result.payment_session_id, 'session_token_prod_xyz123')
      assert.equal(result.amount, 597)
      assert.equal(result.environment, 'production')
      assert.equal(capturedBody.order_amount, 597)

      // Production endpoint must be called
      assert.equal(capturedUrl, 'https://api.cashfree.com/pg/orders')
      assert.equal(capturedHeaders['x-client-id'], testAppId)
      assert.equal(capturedHeaders['x-client-secret'], testSecretKey)
      assert.equal(capturedHeaders['x-api-version'], '2023-08-01')

      // Return URL MUST be strictly HTTPS and preserve booking ID and {order_id}
      assert.equal(
        capturedBody.order_meta.return_url,
        'https://www.vibetogether.show/booking/payment/req_prod_booking_789?order_id={order_id}',
      )
      assert.equal(capturedBody.order_meta.return_url.startsWith('https://'), true)
      assert.equal(capturedBody.order_meta.return_url.includes('http://localhost'), false)

      // Enquiry updated correctly
      assert.equal(enquiry.paymentProvider, 'cashfree')
      assert.equal(enquiry.cfPaymentSessionId, 'session_token_prod_xyz123')
      assert.equal(enquiry.paymentOrderId.startsWith('VT_'), true)
      assert.equal(enquiry.paymentAmount, 597)
      assert.equal(enquiry.paymentOrderAmountPaise, 59_700)

      const retry = await service.createOrder(enquiry.requestId)
      assert.equal(retry.order_id, result.order_id)
      assert.equal(retry.amount, 597)
      assert.equal(enquiry.paymentOrders.length, 1)
    })

    it('reuses a pending legacy order at its recorded amount without creating another order', async () => {
      const enquiry = createMockEnquiry({
        paymentStatus: 'processing',
        paymentOrderId: 'VT_legacy_order',
        paymentOrderAmountPaise: 24_900,
        paymentAmount: 249,
        categoryId: 'fun-games',
        ticketQuantity: 3,
        cfOrderId: 'cf_legacy_order',
        cfPaymentSessionId: 'legacy-session',
        paymentOrders: [{
          orderId: 'VT_legacy_order',
          amount: 249,
          amountPaise: 24_900,
          regularPrice: 299,
          offerPrice: 249,
          diwaliOfferApplied: true,
          status: 'created',
        }],
      })
      let createCalls = 0
      const service = createCashfreePaymentService({
        appId: testAppId,
        secretKey: testSecretKey,
        bookingEnquiryModel: {
          async findOne() {
            return enquiry
          },
        },
        diwaliOfferService: {
          async getPricing() {
            throw new Error('Pending orders must keep their saved price.')
          },
        },
        fetchFn: async () => {
          createCalls += 1
          throw new Error('A pending order must not create another provider order.')
        },
      })

      const result = await service.createOrder(enquiry.requestId)

      assert.equal(createCalls, 0)
      assert.equal(result.order_id, 'VT_legacy_order')
      assert.equal(result.payment_session_id, 'legacy-session')
      assert.equal(result.amount, 249)
      assert.equal(result.pricing.paymentAmountPaise, 24_900)
    })
  })

  describe('Payment verification & redirects', () => {
    it('verifies Cashfree payment, updates booking to paid and allocates reference idempotently', async () => {
      const enquiry = createMockEnquiry({
        paymentOrderId: 'VT_order_test_123',
        cfOrderId: 'cf_order_123',
        paymentProvider: 'cashfree',
        categoryId: 'fun-games',
        ticketQuantity: 3,
        pricePerTicket: 199,
        subtotal: 597,
        finalAmount: 597,
        paymentAmount: 597,
        paymentAmountPaise: 59_700,
        paymentOrderAmountPaise: 59_700,
        paymentOrders: [{
          orderId: 'VT_order_test_123',
          amount: 597,
          amountPaise: 59_700,
          finalAmount: 597,
          ticketQuantity: 3,
          pricePerTicket: 199,
          subtotal: 597,
          status: 'created',
        }],
      })

      let paymentsQueryCount = 0
      const mockFetch = async (url) => {
        if (url.includes('/payments')) {
          paymentsQueryCount += 1
          return {
            ok: true,
            json: async () => [
              {
                cf_payment_id: 11223344,
                payment_status: 'SUCCESS',
                payment_amount: 597,
                payment_currency: 'INR',
                payment_method: { upi: { channel: 'gpay', upi_id: 'john@okaxis' } },
                payment_completion_time: new Date().toISOString(),
              },
            ],
          }
        }
        return {
          ok: true,
          json: async () => ({
            order_id: 'VT_order_test_123',
            order_status: 'PAID',
          }),
        }
      }

      const mockModel = {
        async findOne({ requestId }) {
          if (requestId === enquiry.requestId) return enquiry
          return null
        },
      }

      const bookingResultModel = createMockBookingResultModel()
      let allocatedCount = 0
      const service = createCashfreePaymentService({
        appId: testAppId,
        secretKey: testSecretKey,
        environment: 'PRODUCTION',
        frontendUrl: 'https://www.vibetogether.show',
        bookingEnquiryModel: mockModel,
        bookingResultModel,
        allocateReference: async () => {
          allocatedCount += 1
          return 'VT-REF-2026-001'
        },
        fetchFn: mockFetch,
      })

      const result = await service.verifyPayment(enquiry.requestId, {
        cf_payment_id: 11223344,
        order_id: 'VT_order_test_123',
      })

      assert.equal(result.verified, true)
      assert.equal(result.booking.paymentStatus, 'paid')
      assert.equal(result.booking.paymentAmount, 597)
      assert.equal(result.booking.ticketQuantity, 3)
      assert.equal(result.booking.pricePerTicket, 199)
      assert.equal(result.booking.subtotal, 597)
      assert.equal(result.booking.status, 'confirmed')
      assert.equal(result.booking.reference, 'VT-REF-2026-001')
      assert.equal(result.booking.cfPaymentId, '11223344')
      assert.equal(result.booking.paymentOrderId, 'VT_order_test_123')
      assert.equal(allocatedCount, 1)
      assert.equal(bookingResultModel.record.paymentStatus, 'SUCCESS')
      assert.equal(bookingResultModel.record.requestId, enquiry.requestId)
      assert.equal(bookingResultModel.record.providerPaymentId, '11223344')
      assert.equal(bookingResultModel.record.amount, 597)

      // Repeat verification should be idempotent (not re-allocate reference)
      const repeatResult = await service.verifyPayment(enquiry.requestId, {
        cf_payment_id: 11223344,
        order_id: 'VT_order_test_123',
      })
      assert.equal(repeatResult.duplicate, true)
      assert.equal(repeatResult.booking.reference, 'VT-REF-2026-001')
      assert.equal(allocatedCount, 1)
      assert.equal(bookingResultModel.record.paymentStatus, 'SUCCESS')
      assert.equal(bookingResultModel.writeCount, 2)
    })

    it('persists provider-confirmed failures but leaves pending payments out of bookings-db', async () => {
      for (const testCase of [
        {
          name: 'terminal failure',
          payments: [{
            cf_payment_id: 'cf-failed-1',
            payment_status: 'FAILED',
            payment_amount: 249,
            payment_currency: 'INR',
            payment_message: 'Issuer declined',
            payment_code: 'DECLINED',
          }],
          orderStatus: 'EXPIRED',
          expectedStatus: 'FAILED',
        },
        {
          name: 'pending payment',
          payments: [{
            cf_payment_id: 'cf-pending-1',
            payment_status: 'PENDING',
            payment_amount: 249,
            payment_currency: 'INR',
          }],
          orderStatus: 'ACTIVE',
          expectedStatus: '',
        },
      ]) {
        const enquiry = createMockEnquiry({
          paymentOrderId: `VT_${testCase.name.replaceAll(' ', '_')}`,
          paymentAmount: 249,
          paymentStatus: 'unpaid',
        })
        const bookingResultModel = createMockBookingResultModel()
        const service = createCashfreePaymentService({
          appId: testAppId,
          secretKey: testSecretKey,
          bookingEnquiryModel: {
            async findOne() {
              return enquiry
            },
          },
          bookingResultModel,
          fetchFn: async (url) => url.includes('/payments')
            ? { ok: true, json: async () => testCase.payments }
            : { ok: true, json: async () => ({ order_status: testCase.orderStatus }) },
        })

        const result = await service.verifyPayment(enquiry.requestId, {
          order_id: enquiry.paymentOrderId,
        })

        assert.equal(bookingResultModel.record?.paymentStatus ?? '', testCase.expectedStatus)
        if (testCase.expectedStatus === 'FAILED') {
          assert.equal(result.failed, true)
          assert.equal(bookingResultModel.record.failureReason, 'Issuer declined')
          assert.equal(bookingResultModel.record.failureCode, 'DECLINED')
        } else {
          assert.equal(result.pending, true)
        }
      }
    })

    it('rejects orders that are not recorded for the booking before returning duplicate success', async () => {
      const enquiry = createMockEnquiry({
        paymentStatus: 'paid',
        status: 'confirmed',
        reference: 'VT-REF-EXISTING',
        paymentOrderId: 'VT_order_bound',
        cfPaymentId: '11223344',
      })
      let fetchCount = 0
      const service = createCashfreePaymentService({
        appId: testAppId,
        secretKey: testSecretKey,
        bookingEnquiryModel: {
          async findOne() {
            return enquiry
          },
        },
        fetchFn: async () => {
          fetchCount += 1
          return { ok: true, json: async () => [] }
        },
      })

      await assert.rejects(
        service.verifyPayment(enquiry.requestId, { order_id: 'VT_order_unrelated' }),
        { status: 400 },
      )
      assert.equal(fetchCount, 0)
    })

    it('requires the exact requested Cashfree payment ID and matching amount and INR currency', async () => {
      const cases = [
        {
          name: 'another successful payment ID',
          requestedPaymentId: '11223344',
          payments: [{
            cf_payment_id: 99887766,
            payment_status: 'SUCCESS',
            payment_amount: 199,
            payment_currency: 'INR',
          }],
        },
        {
          name: 'incorrect amount',
          requestedPaymentId: '11223344',
          payments: [{
            cf_payment_id: 11223344,
            payment_status: 'SUCCESS',
            payment_amount: 1,
            payment_currency: 'INR',
          }],
        },
        {
          name: 'non-INR payment currency',
          requestedPaymentId: '11223344',
          payments: [{
            cf_payment_id: 11223344,
            payment_status: 'SUCCESS',
            payment_amount: 199,
            payment_currency: 'USD',
          }],
        },
        {
          name: 'missing payment currency',
          requestedPaymentId: '11223344',
          payments: [{
            cf_payment_id: 11223344,
            payment_status: 'SUCCESS',
            payment_amount: 199,
          }],
        },
        {
          name: 'amount differs from the recorded order amount',
          requestedPaymentId: '11223344',
          recordedOrderAmount: 200,
          payments: [{
            cf_payment_id: 11223344,
            payment_status: 'SUCCESS',
            payment_amount: 199,
            payment_currency: 'INR',
          }],
        },
        {
          name: 'order marked paid without a successful payment',
          requestedPaymentId: '',
          payments: [],
        },
      ]

      for (const testCase of cases) {
        const enquiry = createMockEnquiry({
          paymentOrderId: 'VT_order_verification_bound',
          paymentAmount: 199,
          paymentOrders: testCase.recordedOrderAmount === undefined
            ? []
            : [{
                orderId: 'VT_order_verification_bound',
                amount: testCase.recordedOrderAmount,
              }],
        })
        let allocatedCount = 0
        const service = createCashfreePaymentService({
          appId: testAppId,
          secretKey: testSecretKey,
          environment: 'PRODUCTION',
          bookingEnquiryModel: {
            async findOne() {
              return enquiry
            },
          },
          allocateReference: async () => {
            allocatedCount += 1
            return 'VT-REF-INVALID'
          },
          fetchFn: async (url) => url.includes('/payments')
            ? { ok: true, json: async () => testCase.payments }
            : {
                ok: true,
                json: async () => ({
                  order_id: enquiry.paymentOrderId,
                  order_amount: testCase.recordedOrderAmount ?? enquiry.paymentAmount,
                  order_currency: 'INR',
                  order_status: 'PAID',
                }),
              },
        })

        const result = await service.verifyPayment(enquiry.requestId, {
          cf_payment_id: testCase.requestedPaymentId,
          order_id: enquiry.paymentOrderId,
        })

        assert.equal(result.verified, false, testCase.name)
        assert.equal(enquiry.paymentStatus, 'unpaid', testCase.name)
        assert.equal(enquiry.reference, undefined, testCase.name)
        assert.equal(allocatedCount, 0, testCase.name)
      }
    })

    it('handles Cashfree Webhook PAYMENT_SUCCESS_WEBHOOK with signature validation', async () => {
      const enquiry = createMockEnquiry({
        paymentOrderId: 'VT_order_test_456',
        cfOrderId: 'cf_order_456',
        paymentProvider: 'cashfree',
        categoryId: 'fun-games',
        ticketQuantity: 3,
        pricePerTicket: 199,
        subtotal: 597,
        finalAmount: 597,
        paymentAmount: 597,
        paymentAmountPaise: 59_700,
        paymentOrderAmountPaise: 59_700,
      })

      const mockModel = {
        async findOne(query) {
          if (
            query.requestId === enquiry.requestId ||
            query.paymentOrderId === enquiry.paymentOrderId ||
            query.$or?.some((clause) => clause.paymentOrderId === enquiry.paymentOrderId)
          ) {
            return enquiry
          }
          return null
        },
      }

      const bookingResultModel = createMockBookingResultModel()
      let allocatedCount = 0
      const service = createCashfreePaymentService({
        appId: testAppId,
        secretKey: testSecretKey,
        environment: 'PRODUCTION',
        frontendUrl: 'https://www.vibetogether.show',
        bookingEnquiryModel: mockModel,
        bookingResultModel,
        allocateReference: async () => {
          allocatedCount += 1
          return 'VT-REF-HOOK-001'
        },
      })

      const webhookPayload = {
        data: {
          order: {
            order_id: 'VT_order_test_456',
            order_amount: 597,
            order_currency: 'INR',
          },
          payment: {
            cf_payment_id: 55667788,
            payment_status: 'SUCCESS',
            payment_amount: 597,
            payment_currency: 'INR',
            payment_method: { upi: { channel: 'phonepe' } },
          },
          customer_details: {
            customer_name: 'John Doe',
            customer_phone: '9876543210',
          },
        },
        event_time: new Date().toISOString(),
        type: 'PAYMENT_SUCCESS_WEBHOOK',
      }

      const rawBody = JSON.stringify(webhookPayload)
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const signature = createHmac('sha256', testSecretKey)
        .update(timestamp + rawBody)
        .digest('base64')

      const webhookResult = await service.handleWebhook(webhookPayload, signature, timestamp, rawBody)
      assert.equal(webhookResult.received, true)
      assert.equal(webhookResult.action, 'confirmed')
      assert.equal(webhookResult.booking.paymentStatus, 'paid')
      assert.equal(webhookResult.booking.paymentAmount, 597)
      assert.equal(webhookResult.booking.reference, 'VT-REF-HOOK-001')
      assert.equal(webhookResult.booking.cfPaymentId, '55667788')
      assert.equal(webhookResult.booking.paymentOrderId, 'VT_order_test_456')

      const duplicateResult = await service.handleWebhook(
        webhookPayload,
        signature,
        timestamp,
        rawBody,
      )
      assert.equal(duplicateResult.duplicate, true)
      assert.equal(allocatedCount, 1)
      assert.equal(bookingResultModel.record.paymentStatus, 'SUCCESS')
      assert.equal(bookingResultModel.record.providerPaymentId, '55667788')
      assert.equal(bookingResultModel.writeCount, 2)
    })

    it('does not confirm a success event whose payment amount does not match the booking', async () => {
      const enquiry = createMockEnquiry({
        paymentOrderId: 'VT_order_test_amount',
        paymentProvider: 'cashfree',
        paymentAmount: 199,
        paymentAmountPaise: 19_900,
        paymentOrderAmountPaise: 19_900,
      })
      const service = createCashfreePaymentService({
        appId: testAppId,
        secretKey: testSecretKey,
        environment: 'PRODUCTION',
        bookingEnquiryModel: {
          async findOne() {
            return enquiry
          },
        },
        allocateReference: async () => 'VT-REF-INVALID-AMOUNT',
      })
      const payload = {
        data: {
          order: { order_id: enquiry.paymentOrderId, order_currency: 'INR' },
          payment: {
            cf_payment_id: 778899,
            payment_status: 'SUCCESS',
            payment_amount: 198,
          },
        },
        type: 'PAYMENT_SUCCESS_WEBHOOK',
      }
      const rawBody = JSON.stringify(payload)
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const signature = createHmac('sha256', testSecretKey)
        .update(timestamp + rawBody)
        .digest('base64')

      const result = await service.handleWebhook(payload, signature, timestamp, rawBody)

      assert.equal(result.ignored, true)
      assert.equal(result.reason, 'payment_confirmation_mismatch')
      assert.equal(enquiry.paymentStatus, 'unpaid')
      assert.equal(enquiry.reference, undefined)
    })

    it('rejects Cashfree success webhooks with missing or non-INR payment/order currency', async () => {
      const invalidCurrencies = [
        { label: 'missing payment currency', payment_currency: undefined, order_currency: 'INR' },
        { label: 'non-INR payment currency', payment_currency: 'USD', order_currency: 'INR' },
        { label: 'missing order currency', payment_currency: 'INR', order_currency: undefined },
        { label: 'non-INR order currency', payment_currency: 'INR', order_currency: 'USD' },
        {
          label: 'invalid currency on an already-confirmed booking',
          payment_currency: undefined,
          order_currency: 'INR',
          existingPaid: true,
        },
      ]

      for (const [index, currencies] of invalidCurrencies.entries()) {
        const enquiry = createMockEnquiry({
          requestId: `req_currency_${index}`,
          paymentOrderId: `VT_order_currency_${index}`,
          paymentAmount: 249,
          ...(currencies.existingPaid
            ? { paymentStatus: 'paid', reference: 'VT-REF-ALREADY-PAID' }
            : {}),
        })
        const service = createCashfreePaymentService({
          appId: testAppId,
          secretKey: testSecretKey,
          bookingEnquiryModel: {
            async findOne() {
              return enquiry
            },
          },
          allocateReference: async () => 'VT-REF-INVALID-CURRENCY',
        })
        const payload = {
          data: {
            order: {
              order_id: enquiry.paymentOrderId,
              order_amount: 249,
              ...(currencies.order_currency === undefined
                ? {}
                : { order_currency: currencies.order_currency }),
            },
            payment: {
              cf_payment_id: 334455 + index,
              payment_status: 'SUCCESS',
              payment_amount: 249,
              ...(currencies.payment_currency === undefined
                ? {}
                : { payment_currency: currencies.payment_currency }),
            },
          },
          type: 'PAYMENT_SUCCESS_WEBHOOK',
        }
        const rawBody = JSON.stringify(payload)
        const timestamp = Math.floor(Date.now() / 1000).toString()
        const signature = createHmac('sha256', testSecretKey)
          .update(timestamp + rawBody)
          .digest('base64')

        const result = await service.handleWebhook(payload, signature, timestamp, rawBody)

        assert.equal(result.ignored, true, currencies.label)
        assert.equal(result.reason, 'payment_confirmation_mismatch', currencies.label)
        assert.equal(
          enquiry.paymentStatus,
          currencies.existingPaid ? 'paid' : 'unpaid',
          currencies.label,
        )
        assert.equal(
          enquiry.reference,
          currencies.existingPaid ? 'VT-REF-ALREADY-PAID' : undefined,
          currencies.label,
        )
      }
    })

    it('records dropped and failed payment webhooks properly without marking paid', async () => {
      const enquiry = createMockEnquiry({
        paymentOrderId: 'VT_order_test_789',
        cfOrderId: 'cf_order_789',
        paymentProvider: 'cashfree',
        paymentStatus: 'unpaid',
        paymentOrders: [{ orderId: 'VT_order_test_789', status: 'created' }],
      })

      const mockModel = {
        async findOne(query) {
          if (
            query.requestId === enquiry.requestId ||
            query.paymentOrderId === enquiry.paymentOrderId ||
            query.$or?.some((clause) => clause.paymentOrderId === enquiry.paymentOrderId)
          ) {
            return enquiry
          }
          return null
        },
      }

      const bookingResultModel = createMockBookingResultModel()
      const service = createCashfreePaymentService({
        appId: testAppId,
        secretKey: testSecretKey,
        environment: 'PRODUCTION',
        frontendUrl: 'https://www.vibetogether.show',
        bookingEnquiryModel: mockModel,
        bookingResultModel,
      })

      const droppedPayload = {
        data: {
          order: { order_id: 'VT_order_test_789' },
          payment: { cf_payment_id: 121212, payment_status: 'USER_DROPPED' },
        },
        event_time: new Date().toISOString(),
        type: 'PAYMENT_USER_DROPPED_WEBHOOK',
      }

      const rawBody = JSON.stringify(droppedPayload)
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const signature = createHmac('sha256', testSecretKey)
        .update(timestamp + rawBody)
        .digest('base64')

      const result = await service.handleWebhook(droppedPayload, signature, timestamp, rawBody)
      assert.equal(result.received, true)
      assert.equal(result.action, 'failed')
      assert.equal(result.booking.paymentStatus, 'failed')
      assert.equal(result.booking.paymentFailureReason, 'cancelled')
      assert.equal(result.booking.reference, undefined)
      assert.equal(result.booking.paymentOrderId, 'VT_order_test_789')
      assert.equal(bookingResultModel.record, null)

      const failedPayload = {
        data: {
          order: { order_id: 'VT_order_test_789', order_currency: 'INR' },
          payment: {
            cf_payment_id: 'cf-terminal-failure',
            payment_status: 'FAILED',
            payment_amount: 249,
            payment_currency: 'INR',
            payment_message: 'Issuer declined',
            payment_code: 'DECLINED',
          },
        },
        type: 'PAYMENT_FAILED_WEBHOOK',
      }
      const failedRawBody = JSON.stringify(failedPayload)
      const failedTimestamp = Math.floor(Date.now() / 1000).toString()
      const failedSignature = createHmac('sha256', testSecretKey)
        .update(failedTimestamp + failedRawBody)
        .digest('base64')

      const failedResult = await service.handleWebhook(
        failedPayload,
        failedSignature,
        failedTimestamp,
        failedRawBody,
      )
      const duplicateFailure = await service.handleWebhook(
        failedPayload,
        failedSignature,
        failedTimestamp,
        failedRawBody,
      )

      assert.equal(failedResult.action, 'failed')
      assert.equal(duplicateFailure.duplicate, true)
      assert.equal(bookingResultModel.record.paymentStatus, 'FAILED')
      assert.equal(bookingResultModel.record.failureReason, 'Issuer declined')
      assert.equal(bookingResultModel.record.failureCode, 'DECLINED')
      assert.equal(bookingResultModel.writeCount, 2)
    })
  })
})
