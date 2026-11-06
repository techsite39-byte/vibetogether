import { ArrowRight, HeartHandshake, Sparkles, UsersRound } from 'lucide-react'
import Button from '../components/common/Button.jsx'
import { useBookingEnquiry } from '../context/useBookingEnquiry.js'
import './About.css'

const features = [
  {
    icon: UsersRound,
    title: 'Real Connections',
    description: 'Meet new people and build genuine friendships.',
  },
  {
    icon: Sparkles,
    title: 'Unforgettable Experiences',
    description: 'Discover exciting events and shared adventures.',
  },
  {
    icon: HeartHandshake,
    title: 'One Community',
    description: 'Find your people and create memories together.',
  },
]

const particles = [
  { left: '8%', top: '21%', delay: '-1s', size: '4px' },
  { left: '17%', top: '72%', delay: '-3s', size: '3px' },
  { left: '31%', top: '12%', delay: '-5s', size: '5px' },
  { left: '46%', top: '84%', delay: '-2s', size: '3px' },
  { left: '66%', top: '8%', delay: '-4s', size: '4px' },
  { left: '82%', top: '27%', delay: '-6s', size: '3px' },
  { left: '91%', top: '69%', delay: '-2.5s', size: '5px' },
  { left: '72%', top: '88%', delay: '-1.5s', size: '3px' },
]

export default function About() {
  const { openBooking } = useBookingEnquiry()

  return (
    <section className="about-page" aria-labelledby="about-title">
      <div className="about-page__ambience" aria-hidden="true">
        <span className="about-page__orb about-page__orb--violet" />
        <span className="about-page__orb about-page__orb--blue" />
        {particles.map((particle, index) => (
          <span
            className="about-page__particle"
            key={index}
            style={{
              left: particle.left,
              top: particle.top,
              animationDelay: particle.delay,
              '--particle-size': particle.size,
            }}
          />
        ))}
      </div>

      <div className="about-page__inner container">
        <div className="about-page__copy">
          <p className="about-page__eyebrow">
            <span aria-hidden="true" />
            A community in motion
          </p>
          <h1 className="about-page__title" id="about-title">
            About <span>Vibe Together</span>
          </h1>
          <h2 className="about-page__headline">
            More than just events.
            <br />
            We&apos;re where <span>connections begin.</span>
          </h2>
          <p className="about-page__description">
            VIBE TOGETHER brings people together through unforgettable
            experiences, shared interests and exciting adventures. From music
            and sing-alongs to meeting new people, exploring new places and fun
            group activities, every experience creates an opportunity to
            connect.
          </p>

          <ul className="about-page__features">
            {features.map(({ icon: Icon, title, description }) => (
              <li className="about-page__feature" key={title}>
                <span className="about-page__feature-icon">
                  <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
                </span>
                <span className="about-page__feature-copy">
                  <strong>{title}</strong>
                  <span>{description}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="about-page__actions">
            <Button onClick={() => openBooking()}>
              Find your next experience
              <ArrowRight aria-hidden="true" size={17} />
            </Button>
            <span className="about-page__action-note">
              Good nights start with good people.
            </span>
          </div>
        </div>

        <figure
          className="about-page__visual"
          aria-label="A glimpse of the Vibe Together experience"
        >
          <span className="about-page__visual-glow about-page__visual-glow--one" />
          <span className="about-page__visual-glow about-page__visual-glow--two" />

          <div className="about-page__image about-page__image--main">
            <img
              src="/assets/outdoor-dj-festival.png"
              alt="A crowd enjoying an outdoor DJ festival beneath the lights"
            />
            <div className="about-page__image-caption">
              <span className="about-page__live-dot" />
              <span>Make room for a little magic</span>
            </div>
          </div>

          <div className="about-page__image about-page__image--top">
            <img
              src="/assets/dj-party.png"
              alt="A DJ bringing people together on the dance floor"
            />
          </div>

          <div className="about-page__image about-page__image--bottom">
            <img
              src="/assets/festival-crowd.png"
              alt="Friends sharing the energy of a live music crowd"
            />
          </div>

          <div className="about-page__waveform" aria-hidden="true">
            {Array.from({ length: 13 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
          <figcaption className="about-page__visual-caption">
            Together is the best place to be.
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
