These fixtures follow the request and response shapes in Paystack's public documentation (initialize transaction,
verify transaction, and the webhook events charge.success, invoice.payment_failed, subscription.disable). They were
written by hand from those shapes. They were NOT captured from a live Paystack account. When a Paystack test key is
available, capture real responses and replace them, then rerun the tests.
`__REFERENCE__` is replaced by the test with the reference the adapter generated.
