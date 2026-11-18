function clone(value) {
  return value == null ? value : structuredClone(value)
}

function query(operation) {
  return {
    lean: async () => operation(),
  }
}

export function createMockBookingResultModel() {
  let record = null
  let writeCount = 0

  return {
    get record() {
      return clone(record)
    },
    get writeCount() {
      return writeCount
    },
    findOne(filter) {
      return query(() => (
        record?.requestId === filter.requestId ? clone(record) : null
      ))
    },
    findOneAndUpdate(filter, update, options = {}) {
      return query(() => {
        if (record && record.requestId !== filter.requestId) return null
        if (
          record &&
          filter.paymentStatus?.$ne &&
          record.paymentStatus === filter.paymentStatus.$ne
        ) {
          return null
        }
        if (!record && !options.upsert) return null

        if (!record) {
          record = {
            ...clone(update.$setOnInsert ?? {}),
            ...clone(update.$set ?? {}),
          }
        } else {
          Object.assign(record, clone(update.$set ?? {}))
        }
        writeCount += 1
        return clone(record)
      })
    },
  }
}
