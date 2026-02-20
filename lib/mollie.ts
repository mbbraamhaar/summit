import 'server-only'

const MOLLIE_API_BASE_URL = 'https://api.mollie.com/v2'

type MollieApiErrorShape = {
  title?: string
  detail?: string
}

export class MollieApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'MollieApiError'
    this.status = status
  }
}

export type MolliePayment = {
  id: string
  customerId?: string
  status: string
  sequenceType?: string
  amount: {
    currency: string
    value: string
  }
  metadata?: Record<string, unknown> | null
}

type CreateMollieCustomerInput = {
  name: string
  email: string
  metadata?: Record<string, string>
}

type CreateMolliePaymentInput = {
  amount: {
    currency: 'EUR'
    value: string
  }
  description: string
  customerId: string
  sequenceType: 'first' | 'recurring'
  redirectUrl: string
  webhookUrl: string
  metadata?: Record<string, string>
  method?: string[]
}

type CreateMollieSubscriptionInput = {
  customerId: string
  amount: {
    currency: 'EUR'
    value: string
  }
  interval: string
  description: string
  webhookUrl: string
  metadata?: Record<string, string>
  startDate?: string
}

type CancelMollieSubscriptionInput = {
  customerId: string
  subscriptionId: string
}

type RequestMollieOptions = {
  idempotencyKey?: string
}

function getMollieApiKey() {
  const apiKey = process.env.MOLLIE_API_KEY
  if (!apiKey) {
    throw new Error('MOLLIE_API_KEY is not configured')
  }

  return apiKey
}

function buildMollieErrorMessage(status: number, payload: unknown) {
  if (payload && typeof payload === 'object') {
    const candidate = payload as MollieApiErrorShape
    const title = candidate.title?.trim()
    const detail = candidate.detail?.trim()
    if (title && detail) {
      return `${title}: ${detail}`
    }
    if (detail) {
      return detail
    }
    if (title) {
      return title
    }
  }

  return `Mollie request failed with status ${status}`
}

async function requestMollie<TResponse>(
  path: string,
  init: RequestInit,
  options?: RequestMollieOptions,
): Promise<TResponse> {
  const response = await fetch(`${MOLLIE_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getMollieApiKey()}`,
      'Content-Type': 'application/json',
      ...(options?.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  })

  const payload = (await response.json().catch(() => null)) as unknown
  if (!response.ok) {
    throw new MollieApiError(buildMollieErrorMessage(response.status, payload), response.status)
  }

  return payload as TResponse
}

export async function createMollieCustomer(input: CreateMollieCustomerInput) {
  return requestMollie<{ id: string }>('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      metadata: input.metadata,
    }),
  })
}

export async function createMolliePayment(input: CreateMolliePaymentInput) {
  return requestMollie<MolliePayment & { _links?: { checkout?: { href?: string } } }>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      amount: input.amount,
      description: input.description,
      customerId: input.customerId,
      sequenceType: input.sequenceType,
      redirectUrl: input.redirectUrl,
      webhookUrl: input.webhookUrl,
      metadata: input.metadata,
      method: input.method,
    }),
  })
}

export async function getMolliePayment(paymentId: string) {
  return requestMollie<MolliePayment>(`/payments/${paymentId}`, {
    method: 'GET',
  })
}

export async function createMollieSubscription(
  input: CreateMollieSubscriptionInput,
  options?: RequestMollieOptions,
) {
  return requestMollie<{ id: string }>(
    `/customers/${input.customerId}/subscriptions`,
    {
      method: 'POST',
      body: JSON.stringify({
        amount: input.amount,
        interval: input.interval,
        description: input.description,
        webhookUrl: input.webhookUrl,
        metadata: input.metadata,
        startDate: input.startDate,
      }),
    },
    options,
  )
}

export async function cancelMollieSubscription(input: CancelMollieSubscriptionInput) {
  return requestMollie<{ id: string; status?: string }>(
    `/customers/${input.customerId}/subscriptions/${input.subscriptionId}`,
    {
      method: 'DELETE',
    },
  )
}

export function isMollieApiError(error: unknown): error is MollieApiError {
  return error instanceof MollieApiError
}
