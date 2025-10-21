'use client'

import { useState, useMemo } from 'react'
import Button from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP'
})

const PAYMONGO_TEST_CARDS = [
  {
    label: 'Visa 3DS',
    number: '4311 5188 0466 1120',
    expiry: '12/34',
    cvc: '123'
  },
  {
    label: 'Mastercard 3DS',
    number: '5200 8282 8282 8210',
    expiry: '12/34',
    cvc: '123'
  },
  {
    label: 'Visa non-3DS',
    number: '4000 0025 0000 3155',
    expiry: '12/34',
    cvc: '123'
  }
]

export default function RecipePurchaseModal({
  isOpen,
  onClose,
  recipeId,
  recipeTitle,
  price,
  onSuccess,
  requireAuth
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpMonth, setCardExpMonth] = useState('')
  const [cardExpYear, setCardExpYear] = useState('')
  const [cardCvc, setCardCvc] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)

  const formattedPrice = useMemo(() => pesoFormatter.format(Number(price || 0)), [price])

  const resetState = () => {
    setFullName('')
    setEmail('')
    setCardNumber('')
    setCardExpMonth('')
    setCardExpYear('')
    setCardCvc('')
    setError('')
    setIsSuccess(false)
    setIsProcessing(false)
  }

  const handleClose = () => {
    if (isProcessing) return
    resetState()
    onClose?.()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!recipeId) {
      setError('Recipe identifier is missing. Please refresh the page and try again.')
      return
    }

    if (!fullName.trim() || !email.trim()) {
      setError('Please provide your name and email address.')
      return
    }

    if (!requireAuth?.('purchase premium recipes')) {
      return
    }

    setError('')
    setIsProcessing(true)

    try {
      const response = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          paymentMethod: 'card',
          buyer: {
            name: fullName.trim(),
            email: email.trim()
          },
          cardDetails: {
            cardNumber: cardNumber.replace(/\D+/g, ''),
            expMonth: cardExpMonth,
            expYear: cardExpYear,
            cvc: cardCvc
          }
        })
      })

      const data = await response.json()

      if (!response.ok) {
        if (data?.message) {
          setError(data.message)
        } else {
          setError('Unable to process payment. Please verify your details and try again.')
        }
        return
      }

      if (data.requiresAction && data.redirectUrl) {
        window.location.href = data.redirectUrl
        return
      }

      setIsSuccess(true)
      onSuccess?.(data)
    } catch (paymentError) {
      console.error('Recipe purchase error:', paymentError)
      setError(paymentError.message || 'Payment failed. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Purchase Recipe Access
          </DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-300">
            Unlock <strong>{recipeTitle}</strong> for {formattedPrice}. Payment is powered by PayMongo sandbox.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Juan Dela Cruz"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-olive-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-olive-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Payment Details (PayMongo Sandbox)
              </h3>
              <div className="grid gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Card Number
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={cardNumber.replace(/(\d{4})(?=\d)/g, '$1 ').trim()}
                    onChange={(event) => {
                      const digitsOnly = event.target.value.replace(/\D+/g, '')
                      setCardNumber(digitsOnly.slice(0, 19))
                    }}
                    placeholder="4311 5188 0466 1120"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-olive-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Expiry Month
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={2}
                      value={cardExpMonth}
                      onChange={(event) => setCardExpMonth(event.target.value.replace(/\D+/g, ''))}
                      placeholder="MM"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-olive-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Expiry Year
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={4}
                      value={cardExpYear}
                      onChange={(event) => setCardExpYear(event.target.value.replace(/\D+/g, ''))}
                      placeholder="YY"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-olive-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      CVC
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={4}
                      value={cardCvc}
                      onChange={(event) => setCardCvc(event.target.value.replace(/\D+/g, ''))}
                      placeholder="123"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-olive-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>
              </div>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-md text-sm text-blue-700 dark:text-blue-200 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5" />
                  <p>
                    Use a PayMongo sandbox card for testing. Real cards will not work in the development environment.
                  </p>
                </div>
                <ul className="grid gap-2 text-xs md:text-sm">
                  {PAYMONGO_TEST_CARDS.map((card) => (
                    <li key={card.number} className="flex items-center justify-between">
                      <span className="font-medium">{card.label}</span>
                      <span className="font-mono">{card.number} · {card.expiry} · {card.cvc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-200 text-sm">
              {error}
            </div>
          )}

          {isSuccess ? (
            <div className="flex flex-col items-center gap-3 p-6 rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-200">
              <div className="h-12 w-12 flex items-center justify-center rounded-full bg-green-100 dark:bg-green-800/60">
                <CheckCircle className="h-7 w-7" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold">Payment successful!</p>
                <p className="text-sm text-green-600 dark:text-green-300">
                  You now have access to this premium recipe.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={handleClose}>
                Close
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-3">
              <Button type="button" variant="secondary" disabled={isProcessing} onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isProcessing} className="flex items-center gap-2">
                {isProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
                {isProcessing ? 'Processing...' : `Pay ${formattedPrice}`}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
