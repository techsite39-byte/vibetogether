import mongoose from 'mongoose'

const diwaliOfferSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'diwali-special',
    },
    enabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    regularPrice: {
      type: Number,
      required: true,
      min: 1,
      default: 299,
    },
    offerPrice: {
      type: Number,
      required: true,
      min: 1,
      default: 249,
    },
    activationAt: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    collection: 'diwali-offers',
    timestamps: true,
    versionKey: false,
  },
)

export const DiwaliOffer =
  mongoose.models.DiwaliOffer ??
  mongoose.model('DiwaliOffer', diwaliOfferSchema)
