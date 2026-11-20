import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { buildEventImageUpdate } from '../src/admin/data/adminEventOperations.js'

const manageEventsPath = path.resolve('src/admin/pages/ManageEvents.jsx')
const manageEventsContent = fs.readFileSync(manageEventsPath, 'utf8')

test('1. ManageEvents has no undeclared storageError or setFailedPreview references', () => {
  // Check that storageError is destructured from useAdminData()
  assert.ok(
    manageEventsContent.includes('storageError, updateEvent') ||
    manageEventsContent.includes('storageError } = useAdminData()') ||
    manageEventsContent.includes('storageError,') && manageEventsContent.includes('useAdminData()'),
    'storageError is properly destructured from useAdminData()',
  )

  // Check that setFailedPreview (which was a bug) is completely gone
  assert.ok(
    !manageEventsContent.includes('setFailedPreview'),
    'Undeclared setFailedPreview is completely eliminated',
  )

  // setPreviewFailed(false) is called on direct image input change
  assert.ok(
    manageEventsContent.includes('setPreviewFailed(false)'),
    'setPreviewFailed(false) is correctly called',
  )
})

test('2. EditEventDialog supports priceAmount, seatsAvailable, and organizer', () => {
  assert.ok(manageEventsContent.includes('priceAmount: String(event.priceAmount ?? \'0\')'), 'priceAmount initialized in EditEventDialog')
  assert.ok(manageEventsContent.includes('seatsAvailable: String(event.seatsAvailable ?? \'0\')'), 'seatsAvailable initialized in EditEventDialog')
  assert.ok(manageEventsContent.includes('organizer: event.organizer'), 'organizer supported in EditEventDialog')

  // Inputs exist
  assert.ok(manageEventsContent.includes('Price amount (₹)'), 'Price amount label present in edit dialog')
  assert.ok(manageEventsContent.includes('Available seats'), 'Available seats label present in edit dialog')
  assert.ok(manageEventsContent.includes('Organizer'), 'Organizer label present in edit dialog')

  // EditEventDialog has saving feedback
  assert.ok(manageEventsContent.includes('Saving…'), 'Saving feedback present on edit button')
})

test('3. NewEventDialog supports priceAmount, seatsAvailable, organizer, and published status', () => {
  assert.ok(manageEventsContent.includes('effectiveCategory'), 'Category fallback is safely derived')
  assert.ok(manageEventsContent.includes('effectiveOrganizer'), 'Organizer fallback is safely derived')
  assert.ok(manageEventsContent.includes('Price amount (₹)'), 'Price amount label present in add dialog')
  assert.ok(manageEventsContent.includes('Available seats'), 'Available seats label present in add dialog')
  assert.ok(manageEventsContent.includes('Creating…'), 'Creating feedback present on create button')
  assert.ok(manageEventsContent.includes('status: \'published\''), 'Defaults to published status')
})

test('4. buildEventImageUpdate detects image changes correctly', () => {
  // Unchanged image produces empty object
  assert.deepEqual(buildEventImageUpdate('https://example.com/a.jpg', 'https://example.com/a.jpg'), {})
  assert.deepEqual(buildEventImageUpdate('   ', ''), {})

  // Changed image produces update object
  assert.deepEqual(
    buildEventImageUpdate('https://example.com/old.jpg', 'https://example.com/new.jpg'),
    { image: 'https://example.com/new.jpg' },
  )
  assert.deepEqual(
    buildEventImageUpdate('https://example.com/old.jpg', ''),
    { image: '' },
  )
})
