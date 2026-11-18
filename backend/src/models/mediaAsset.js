import mongoose from 'mongoose'

const mediaAssetSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    data: {
      type: Buffer,
      required: true,
    },
    uploadedBy: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
  },
  {
    collection: 'media-assets-db',
    timestamps: true,
    versionKey: false,
  },
)

mediaAssetSchema.index({ createdAt: -1 })

export function normalizeMediaBuffer(data) {
  if (Buffer.isBuffer(data)) {
    return data
  }
  if (data && Buffer.isBuffer(data.buffer)) {
    return data.buffer
  }
  if (data && typeof data.read === 'function') {
    return data.read(0, typeof data.length === 'function' ? data.length() : data.length)
  }
  if (data && data.buffer instanceof ArrayBuffer) {
    return Buffer.from(data.buffer, data.byteOffset || 0, data.byteLength || data.buffer.byteLength)
  }
  return Buffer.from(data || [])
}

export const MediaAsset =
  mongoose.models.MediaAsset ?? mongoose.model('MediaAsset', mediaAssetSchema)
