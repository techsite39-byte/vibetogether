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

export const MediaAsset =
  mongoose.models.MediaAsset ?? mongoose.model('MediaAsset', mediaAssetSchema)
