import { categories as sourceCategories } from '../../../src/data/categories.js'
import { AdminCredential, Category } from '../models/adminRecords.js'
import { hashAdminPassword, verifyAdminPassword } from '../auth/adminAuth.js'

export async function provisionAdminAccount({ username, password, model = AdminCredential }) {
  const normalizedUsername = username?.trim().toLowerCase()
  if (
    typeof normalizedUsername !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedUsername)
  ) {
    throw new Error('ADMIN_EMAIL must be a valid email address.')
  }

  await model.init()
  const existing = await model.findOne({ username: normalizedUsername })
    .select('+passwordHash username role')
    .exec()
  if (existing) {
    if (await verifyAdminPassword(password, existing.passwordHash)) {
      return { created: false, role: existing.role }
    }
    throw new Error('An admin account already exists for this email; no changes were made.')
  }

  try {
    await model.create({
      username: normalizedUsername,
      passwordHash: await hashAdminPassword(password),
      role: 'admin',
      active: true,
    })
    return { created: true, role: 'admin' }
  } catch (error) {
    if (error.code !== 11000) {
      throw error
    }
    const duplicate = await model.findOne({ username: normalizedUsername })
      .select('+passwordHash username role')
      .exec()
    if (duplicate && await verifyAdminPassword(password, duplicate.passwordHash)) {
      return { created: false, role: duplicate.role }
    }
    throw new Error('An admin account already exists for this email; no changes were made.')
  }
}

export async function initializeAdminRecords({
  bootstrapPasswordHash,
  username,
}) {
  await Promise.all([AdminCredential.init(), Category.init()])

  if (username && bootstrapPasswordHash) {
    await AdminCredential.findOneAndUpdate(
      { username: username.trim().toLowerCase() },
      {
        $setOnInsert: {
          username: username.trim().toLowerCase(),
          passwordHash: bootstrapPasswordHash,
          role: 'admin',
          active: true,
        },
      },
      { upsert: true, new: false, setDefaultsOnInsert: true },
    ).exec()
  }

  const categoryCount = await Category.estimatedDocumentCount()
  if (categoryCount === 0) {
    await Category.insertMany(
      sourceCategories.map(({ id, title, description, image, imageAlt }) => ({
        id,
        title,
        description,
        image,
        imageAlt,
        enabled: true,
      })),
      { ordered: false },
    )
  }
}
