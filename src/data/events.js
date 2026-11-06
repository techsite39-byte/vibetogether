const categoryDetails = {
  'Sing Along': {
    highlights: [
      'A welcoming sing-together session for every voice',
      'A shared set list of familiar favorites',
      'A relaxed social hour after the music',
    ],
    activities: ['Group sing-along', 'Open-mic moments', 'Meet-and-mingle'],
    schedule: [
      { time: '7:00 PM', activity: 'Doors open and welcome' },
      { time: '7:30 PM', activity: 'Sing-along session begins' },
      { time: '9:00 PM', activity: 'Open-mic and social hour' },
    ],
    guidelines: [
      'All singing levels are welcome; joining in is always optional.',
      'Please respect the venue and the people sharing the room.',
      'Follow any venue age and entry requirements.',
    ],
    gallery: [
      {
        src: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=82',
        alt: 'A singer connecting with a warmly lit audience',
      },
      {
        src: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=82',
        alt: 'Live music on stage under colorful lights',
      },
    ],
  },
  'Strangers Meet': {
    highlights: [
      'A friendly welcome for solo guests and groups',
      'Conversation starters to make introductions easier',
      'Time to connect at your own pace',
    ],
    activities: ['Welcome circle', 'Optional icebreakers', 'Open social time'],
    schedule: [
      { time: '5:45 PM', activity: 'Doors open and welcome' },
      { time: '6:15 PM', activity: 'Optional introductions and icebreakers' },
      { time: '7:00 PM', activity: 'Open table and conversation time' },
    ],
    guidelines: [
      'Participation in icebreakers is optional.',
      'Be respectful of personal boundaries and different perspectives.',
      'Please follow the venue team’s guidance during the gathering.',
    ],
    gallery: [
      {
        src: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=82',
        alt: 'Friends sharing an easy conversation outdoors',
      },
      {
        src: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=82',
        alt: 'A welcoming table prepared for a community gathering',
      },
    ],
  },
  'Strangers Trip': {
    highlights: [
      'A small-group journey with room to meet new people',
      'Time to enjoy the route and take in the scenery',
      'A shared day out with a friendly group',
    ],
    activities: ['Group departure', 'Scenic stops', 'Shared exploration'],
    schedule: [
      { time: '7:30 AM', activity: 'Group check-in and welcome' },
      { time: '8:00 AM', activity: 'Departure and journey briefing' },
      { time: '10:00 AM', activity: 'First scenic stop and group time' },
    ],
    guidelines: [
      'Arrive at the confirmed meeting point before departure.',
      'Wear comfortable clothing suitable for the planned outing.',
      'Follow the trip host’s safety instructions throughout the journey.',
    ],
    gallery: [
      {
        src: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=82',
        alt: 'A mountain path leading toward a dramatic peak',
      },
      {
        src: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=82',
        alt: 'A quiet alpine lake surrounded by mountains',
      },
    ],
  },
  'Fun Games': {
    highlights: [
      'Easy-to-join games for different play styles',
      'Friendly team challenges with no experience needed',
      'Time to meet people between rounds',
    ],
    activities: ['Team warm-up', 'Rotating game rounds', 'Final friendly challenge'],
    schedule: [
      { time: '3:45 PM', activity: 'Doors open and team check-in' },
      { time: '4:15 PM', activity: 'Warm-up games and team rounds' },
      { time: '5:30 PM', activity: 'Final challenge and social time' },
    ],
    guidelines: [
      'Games are for fun; good sportsmanship comes first.',
      'Let the host know if you need an activity adjustment.',
      'Follow venue instructions and use shared equipment with care.',
    ],
    gallery: [
      {
        src: 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=1200&q=82',
        alt: 'A colorful tabletop game ready for friends',
      },
      {
        src: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=82',
        alt: 'A friendly gaming setup ready for a team challenge',
      },
    ],
  },
}

const eventDetails = {
  'after-hours-sing-along': {
    description:
      'Take a break from the usual night out and sing along to the songs everyone knows. After Hours is a relaxed, hosted music gathering where the room becomes the chorus and meeting new people happens naturally between songs.',
    venueDetails:
      'Hosted at a downtown music lounge. Final venue access and arrival guidance will be shared with guests before the event.',
  },
  'the-open-table': {
    description:
      'Pull up a chair and meet people over an easy, welcoming community gathering. The Open Table makes space for conversation, optional icebreakers, and the kind of introductions that can turn into lasting friendships.',
    venueDetails:
      'Hosted at a riverside community space. Exact meeting instructions will be shared with registered guests.',
  },
  'somewhere-together': {
    description:
      'The best part of a day out is often who you share it with. Somewhere Together brings a small group together for a scenic outing, relaxed stops, and the pleasure of discovering somewhere new.',
    venueDetails:
      'The group meeting point and trip-specific arrival information will be shared with guests before departure.',
  },
  'the-playground': {
    description:
      'A playful afternoon of low-pressure games, friendly teams, and plenty of chances to meet someone new. Come ready to try a few rounds; no special skills or competitive streak required.',
    venueDetails:
      'Hosted at The Commons activity studio. Please check the event-day message for entry and accessibility details.',
  },
  'one-more-song': {
    description:
      'Stay for one more song. This welcoming live-music gathering pairs familiar favorites with a relaxed open-mic and time to connect with fellow music lovers.',
    venueDetails:
      'Hosted in The Lantern live room. Venue entry and access details will be shared before the gathering.',
  },
  'the-good-company-club': {
    description:
      'A thoughtful, easy-going meetup for good conversation and new company. Join the welcome circle if you like, try an icebreaker, or simply settle in and let the conversation find you.',
    venueDetails:
      'Hosted at The Garden Room. Arrival guidance and the exact entrance will be confirmed before the event.',
  },
  'the-scenic-route': {
    description:
      'Take a weekend adventure beyond your usual routine. The Scenic Route is a group day out designed for shared discoveries, fresh air, and the conversations that happen along the way.',
    venueDetails:
      'The departure point and trip-specific venue details will be shared with guests ahead of the outing.',
  },
  'friendly-fire': {
    description:
      'Bring your team spirit to a friendly gaming afternoon. Friendly Fire mixes approachable challenges, rotating teams, and plenty of breaks to catch up with new people.',
    venueDetails:
      'Hosted at the Eastside games hall. Check the event-day message for access and venue guidance.',
  },
}

const eventRecords = [
  {
    id: 'after-hours-sing-along',
    title: 'After Hours Sing Along',
    category: 'Sing Along',
    date: '2026-11-22',
    time: '7:30 PM',
    startsAt: '2026-11-22T19:30:00+05:30',
    location: 'Downtown music lounge',
    organizer: 'Vibe Together',
    price: '₹24',
    priceAmount: 24,
    currency: 'INR',
    isFree: false,
    seatsAvailable: 18,
    createdAt: '2026-10-28T10:00:00Z',
    image:
      'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1000&q=82',
    imageAlt: 'A concert crowd sharing a live music moment',
  },
  {
    id: 'the-open-table',
    title: 'The Open Table',
    category: 'Strangers Meet',
    date: '2026-11-28',
    time: '6:00 PM',
    startsAt: '2026-11-28T18:00:00+05:30',
    location: 'Riverside community space',
    organizer: 'Community hosted',
    price: 'Free',
    priceAmount: 0,
    currency: 'INR',
    isFree: true,
    seatsAvailable: 12,
    createdAt: '2026-10-12T10:00:00Z',
    image:
      'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1000&q=82',
    imageAlt: 'A warmly lit table set for a shared gathering',
  },
  {
    id: 'somewhere-together',
    title: 'Somewhere Together',
    category: 'Strangers Trip',
    date: '2026-12-05',
    time: '8:00 AM',
    startsAt: '2026-12-05T08:00:00+05:30',
    location: 'Meet-up point shared after booking',
    organizer: 'Vibe Together',
    price: '₹68',
    priceAmount: 68,
    currency: 'INR',
    isFree: false,
    seatsAvailable: 9,
    createdAt: '2026-10-20T10:00:00Z',
    image:
      'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1000&q=82',
    imageAlt: 'A scenic mountain lake surrounded by hills',
  },
  {
    id: 'the-playground',
    title: 'The Playground',
    category: 'Fun Games',
    date: '2026-12-12',
    time: '4:00 PM',
    startsAt: '2026-12-12T16:00:00+05:30',
    location: 'The Commons activity studio',
    organizer: 'Vibe Together',
    price: '₹16',
    priceAmount: 16,
    currency: 'INR',
    isFree: false,
    seatsAvailable: 24,
    createdAt: '2026-10-30T10:00:00Z',
    image:
      'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?auto=format&fit=crop&w=1000&q=82',
    imageAlt: 'A colorful tabletop game ready for a friendly challenge',
  },
  {
    id: 'one-more-song',
    title: 'One More Song',
    category: 'Sing Along',
    date: '2026-12-19',
    time: '8:00 PM',
    startsAt: '2026-12-19T20:00:00+05:30',
    location: 'The Lantern live room',
    organizer: 'Community hosted',
    price: 'Free',
    priceAmount: 0,
    currency: 'INR',
    isFree: true,
    seatsAvailable: 30,
    createdAt: '2026-11-02T10:00:00Z',
    image:
      'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1000&q=82',
    imageAlt: 'A singer performing for a warmly lit audience',
  },
  {
    id: 'the-good-company-club',
    title: 'The Good Company Club',
    category: 'Strangers Meet',
    date: '2027-01-09',
    time: '5:30 PM',
    startsAt: '2027-01-09T17:30:00+05:30',
    location: 'The Garden Room',
    organizer: 'Vibe Together',
    price: '₹12',
    priceAmount: 12,
    currency: 'INR',
    isFree: false,
    seatsAvailable: 16,
    createdAt: '2026-11-03T10:00:00Z',
    image:
      'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1000&q=82',
    imageAlt: 'Friends meeting outdoors and enjoying each other’s company',
  },
  {
    id: 'the-scenic-route',
    title: 'The Scenic Route',
    category: 'Strangers Trip',
    date: '2027-01-16',
    time: '7:00 AM',
    startsAt: '2027-01-16T07:00:00+05:30',
    location: 'Departure details shared after booking',
    organizer: 'Community hosted',
    price: '₹92',
    priceAmount: 92,
    currency: 'INR',
    isFree: false,
    seatsAvailable: 6,
    createdAt: '2026-11-01T10:00:00Z',
    image:
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1000&q=82',
    imageAlt: 'A mountain trail winding toward a snowy peak',
  },
  {
    id: 'friendly-fire',
    title: 'Friendly Fire',
    category: 'Fun Games',
    date: '2027-01-23',
    time: '3:00 PM',
    startsAt: '2027-01-23T15:00:00+05:30',
    location: 'Eastside games hall',
    organizer: 'Vibe Together',
    price: '₹20',
    priceAmount: 20,
    currency: 'INR',
    isFree: false,
    seatsAvailable: 20,
    createdAt: '2026-11-04T10:00:00Z',
    image:
      'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1000&q=82',
    imageAlt: 'A lively gaming setup ready for a friendly competition',
  },
]

export const events = eventRecords.map((event) => ({
  ...event,
  ...categoryDetails[event.category],
  ...eventDetails[event.id],
}))
