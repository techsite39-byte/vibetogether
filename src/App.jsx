import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppErrorBoundary from './components/common/AppErrorBoundary.jsx'
import Loader from './components/common/Loader.jsx'
import { BookingEnquiryProvider } from './context/BookingEnquiryContext.jsx'
import MainLayout from './components/layout/MainLayout.jsx'

const Dashboard = lazy(() => import('./admin/pages/Dashboard.jsx'))
const AdminLayout = lazy(() => import('./admin/components/AdminLayout.jsx'))
const AdminLoginPage = lazy(() => import('./admin/pages/AdminLoginPage.jsx'))
const ManageUsers = lazy(() => import('./admin/pages/ManageUsers.jsx'))
const ManageOrganizers = lazy(() => import('./admin/pages/ManageOrganizers.jsx'))
const Analytics = lazy(() => import('./admin/pages/Analytics.jsx'))
const ActivityLog = lazy(() => import('./admin/pages/ActivityLog.jsx'))
const ManageEvents = lazy(() => import('./admin/pages/ManageEvents.jsx'))
const ManageBookings = lazy(() => import('./admin/pages/ManageBookings.jsx'))
const ManageTestimonials = lazy(() => import('./admin/pages/ManageTestimonials.jsx'))
const ManageSubscribers = lazy(() => import('./admin/pages/ManageSubscribers.jsx'))
const ManageEnquiries = lazy(() => import('./admin/pages/ManageEnquiries.jsx'))
const Settings = lazy(() => import('./admin/pages/Settings.jsx'))
const ManageGallery = lazy(() => import('./admin/pages/ManageGallery.jsx'))
const About = lazy(() => import('./pages/About.jsx'))
const Booking = lazy(() => import('./pages/Booking.jsx'))
const BookingConfirmation = lazy(() => import('./pages/BookingConfirmation.jsx'))
const BookingPayment = lazy(() => import('./pages/BookingPayment.jsx'))
const Contact = lazy(() => import('./pages/Contact.jsx'))
const EventDetails = lazy(() => import('./pages/EventDetails.jsx'))
const Events = lazy(() => import('./pages/Events.jsx'))
const Gallery = lazy(() => import('./pages/Gallery.jsx'))
const FunGames = lazy(() => import('./pages/FunGames.jsx'))
const Home = lazy(() => import('./pages/Home.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))
const MyBookings = lazy(() => import('./pages/MyBookings.jsx'))
const Services = lazy(() => import('./pages/Services.jsx'))
const SingAlong = lazy(() => import('./pages/SingAlong.jsx'))
const StrangersMeet = lazy(() => import('./pages/StrangersMeet.jsx'))
const StrangersTrip = lazy(() => import('./pages/StrangersTrip.jsx'))
const Testimonials = lazy(() => import('./pages/Testimonials.jsx'))

function App() {
  return (
    <BrowserRouter>
      <BookingEnquiryProvider>
        <AppErrorBoundary>
          <Suspense fallback={<Loader className="route-loader" label="Loading page..." />}>
            <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="about" element={<About />} />
          <Route path="events" element={<Events />} />
          <Route path="events/:id" element={<EventDetails />} />
          <Route
            path="booking/confirmation"
            element={<BookingConfirmation />}
          />
          <Route
            path="booking/confirmation/:bookingReference"
            element={<BookingConfirmation />}
          />
          <Route
            path="booking/payment/:requestId"
            element={<BookingPayment />}
          />
          <Route path="my-bookings" element={<MyBookings />} />
          <Route path="booking" element={<Booking />} />
          <Route path="booking/step-4/:requestId" element={<div aria-hidden="true" />} />
          <Route path="booking/:eventId" element={<Booking />} />
          <Route path="sing-along" element={<SingAlong />} />
          <Route path="strangers-meet" element={<StrangersMeet />} />
          <Route path="strangers-trip" element={<StrangersTrip />} />
          <Route path="fun-games" element={<FunGames />} />
          <Route path="services" element={<Services />} />
          <Route path="gallery" element={<Gallery />} />
          <Route path="testimonials" element={<Testimonials />} />
          <Route path="contact" element={<Contact />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="admin/login" element={<AdminLoginPage />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="users" element={<ManageUsers />} />
          <Route path="organizers" element={<ManageOrganizers />} />
          <Route path="events" element={<ManageEvents />} />
          <Route path="bookings" element={<ManageBookings />} />
          <Route path="testimonials" element={<ManageTestimonials />} />
          <Route path="subscribers" element={<ManageSubscribers />} />
          <Route path="enquiries" element={<ManageEnquiries />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="activity" element={<ActivityLog />} />
          <Route path="settings" element={<Settings />} />
          <Route path="gallery" element={<ManageGallery />} />
          <Route path="*" element={<NotFound />} />
        </Route>
            </Routes>
          </Suspense>
        </AppErrorBoundary>
      </BookingEnquiryProvider>
    </BrowserRouter>
  )
}

export default App
