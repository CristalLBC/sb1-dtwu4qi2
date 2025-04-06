import React, { useState, useEffect } from 'react';
import { Search, MapPin, Clock, PawPrint, Star, Loader2, Navigation, LogIn, LogOut } from 'lucide-react';
import Map, { Marker, Popup } from 'react-map-gl';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from './lib/supabase';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Location {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  image_url: string;
  features: string[];
  average_rating?: number;
  review_count?: number;
}

interface Review {
  id: string;
  rating: number;
  comment: string;
  user_id: string;
  created_at: string;
  users?: {
    email: string;
  };
}

interface Viewport {
  latitude: number;
  longitude: number;
  zoom: number;
}

// Debug: Log Mapbox token
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
console.log('Mapbox Token:', MAPBOX_TOKEN?.slice(0, 8) + '...');

function App() {
  const [session, setSession] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [city, setCity] = useState('');
  const [walkLength, setWalkLength] = useState('30');
  const [locations, setLocations] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<GeolocationPosition | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [newReview, setNewReview] = useState({ rating: 5, comment: '' });
  const [viewport, setViewport] = useState<Viewport>({
    latitude: 40.7128,
    longitude: -74.0060,
    zoom: 12
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation(position);
          setViewport({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            zoom: 12
          });
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }
  }, []);

  const fetchLocations = async (lat: number, lon: number) => {
    try {
      const { data, error } = await supabase
        .from('locations')
        .select(`
          *,
          reviews (
            rating
          )
        `)
        .order('name');

      if (error) throw error;

      const locationsWithStats = data.map(location => ({
        ...location,
        average_rating: location.reviews.length > 0
          ? location.reviews.reduce((acc, rev) => acc + rev.rating, 0) / location.reviews.length
          : 0,
        review_count: location.reviews.length
      }));

      setLocations(locationsWithStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch locations');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearching(true);
    setError(null);

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}`);
      const data = await response.json();

      if (data.length === 0) {
        throw new Error('City not found');
      }

      const cityLat = parseFloat(data[0].lat);
      const cityLon = parseFloat(data[0].lon);

      setViewport({
        latitude: cityLat,
        longitude: cityLon,
        zoom: 12
      });

      await fetchLocations(cityLat, cityLon);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while searching');
      setLocations([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (userLocation) {
      setViewport({
        latitude: userLocation.coords.latitude,
        longitude: userLocation.coords.longitude,
        zoom: 12
      });
      fetchLocations(userLocation.coords.latitude, userLocation.coords.longitude);
    }
  };

  const fetchReviews = async (locationId: string) => {
    const { data, error } = await supabase
      .from('reviews')
      .select(`
        *,
        users:user_id (
          email
        )
      `)
      .eq('location_id', locationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching reviews:', error);
      return;
    }

    setReviews(data);
  };

  const handleSubmitReview = async (locationId: string) => {
    if (!session) {
      setShowAuth(true);
      return;
    }

    try {
      const { error } = await supabase
        .from('reviews')
        .insert({
          location_id: locationId,
          user_id: session.user.id,
          rating: newReview.rating,
          comment: newReview.comment
        });

      if (error) throw error;

      setNewReview({ rating: 5, comment: '' });
      fetchReviews(locationId);
      fetchLocations(viewport.latitude, viewport.longitude);
    } catch (err) {
      console.error('Error submitting review:', err);
    }
  };

  const renderStars = (rating: number, interactive = false) => {
    return Array.from({ length: 5 }).map((_, index) => (
      <Star
        key={index}
        className={`w-4 h-4 ${
          index < rating
            ? 'text-yellow-400 fill-current'
            : 'text-gray-300'
        } ${interactive ? 'cursor-pointer' : ''}`}
        onClick={interactive ? () => setNewReview({ ...newReview, rating: index + 1 }) : undefined}
      />
    ));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-green-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <PawPrint className="w-12 h-12 text-blue-600" />
            <div>
              <h1 className="text-4xl font-bold text-gray-900">PupWalk Finder</h1>
              <p className="text-lg text-gray-600">Discover the perfect walking spots</p>
            </div>
          </div>
          <button
            onClick={() => session ? supabase.auth.signOut() : setShowAuth(true)}
            className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow-sm hover:shadow-md transition-shadow"
          >
            {session ? (
              <>
                <LogOut className="w-5 h-5" />
                <span>Sign Out</span>
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                <span>Sign In</span>
              </>
            )}
          </button>
        </div>

        {showAuth && !session && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-xl shadow-xl max-w-md w-full">
              <Auth
                supabaseClient={supabase}
                appearance={{ theme: ThemeSupa }}
                providers={[]}
              />
              <button
                onClick={() => setShowAuth(false)}
                className="mt-4 w-full bg-gray-100 py-2 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-12">
          <div className="bg-white p-6 rounded-xl shadow-lg space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="pl-10 w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="Enter city name"
                    required
                  />
                  {userLocation && (
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-600 hover:text-blue-700"
                    >
                      <Navigation className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="md:w-1/3">
                <label htmlFor="walkLength" className="block text-sm font-medium text-gray-700 mb-1">Walk Length (min)</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <select
                    id="walkLength"
                    value={walkLength}
                    onChange={(e) => setWalkLength(e.target.value)}
                    className="pl-10 w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">60 minutes</option>
                  </select>
                </div>
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 flex items-center justify-center gap-2"
              disabled={isSearching}
            >
              {isSearching ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Search className="w-5 h-5" />
              )}
              {isSearching ? 'Searching...' : 'Find Walking Spots'}
            </button>
          </div>
        </form>

        {error && (
          <div className="max-w-2xl mx-auto mb-8 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-[600px] bg-white rounded-xl shadow-lg overflow-hidden">
            <Map
              {...viewport}
              onMove={evt => setViewport(evt.viewState)}
              mapStyle="mapbox://styles/mapbox/streets-v11"
              mapboxAccessToken={MAPBOX_TOKEN}
            >
              {locations.map((location) => (
                <Marker
                  key={location.id}
                  longitude={location.longitude}
                  latitude={location.latitude}
                  onClick={() => setSelectedLocation(location)}
                >
                  <MapPin className="w-6 h-6 text-blue-600 -translate-x-1/2 -translate-y-1/2 cursor-pointer" />
                </Marker>
              ))}
              {selectedLocation && (
                <Popup
                  longitude={selectedLocation.longitude}
                  latitude={selectedLocation.latitude}
                  onClose={() => setSelectedLocation(null)}
                  closeButton={true}
                  closeOnClick={false}
                  anchor="bottom"
                >
                  <div className="p-2">
                    <h3 className="font-semibold">{selectedLocation.name}</h3>
                    <p className="text-sm text-gray-600">{selectedLocation.description}</p>
                  </div>
                </Popup>
              )}
            </Map>
          </div>

          <div className="space-y-6">
            {locations.map((location) => (
              <div
                key={location.id}
                className="bg-white rounded-xl shadow-lg overflow-hidden transition-transform hover:scale-105 cursor-pointer"
                onClick={() => {
                  setSelectedLocation(location);
                  fetchReviews(location.id);
                  setViewport({
                    latitude: location.latitude,
                    longitude: location.longitude,
                    zoom: 14
                  });
                }}
              >
                <img src={location.image_url} alt={location.name} className="w-full h-48 object-cover" />
                <div className="p-6">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{location.name}</h3>
                  <p className="text-gray-600 mb-4">{location.description}</p>
                  <div className="flex items-center gap-4 text-gray-500 mb-4">
                    <div className="flex items-center gap-1">
                      {renderStars(location.average_rating || 0)}
                      <span className="ml-2 text-sm">
                        ({location.review_count || 0} reviews)
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {location.features.map((feature, featureIndex) => (
                      <span
                        key={featureIndex}
                        className="inline-block bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full mr-2"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>

                {selectedLocation?.id === location.id && (
                  <div className="border-t p-6">
                    <h4 className="font-semibold mb-4">Reviews</h4>
                    {session && (
                      <div className="mb-6">
                        <div className="flex items-center gap-2 mb-2">
                          {renderStars(newReview.rating, true)}
                        </div>
                        <textarea
                          value={newReview.comment}
                          onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                          className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 mb-2"
                          placeholder="Write your review..."
                          rows={3}
                        />
                        <button
                          onClick={() => handleSubmitReview(location.id)}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                        >
                          Submit Review
                        </button>
                      </div>
                    )}
                    <div className="space-y-4">
                      {reviews.map((review) => (
                        <div key={review.id} className="border-t pt-4">
                          <div className="flex items-center gap-2 mb-1">
                            {renderStars(review.rating)}
                          </div>
                          <p className="text-gray-600">{review.comment}</p>
                          <p className="text-sm text-gray-400 mt-1">
                            {new Date(review.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;