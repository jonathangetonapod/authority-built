import { useState, useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface Notification {
  id: string;
  name: string;
  location: string;
  action: string;
  timeAgo: string;
  show: boolean;
}

const names = [
  'Sarah Chen', 'Michael Rodriguez', 'Emily Watson', 'David Park', 'Jessica Taylor',
  'James Anderson', 'Maria Garcia', 'Robert Kim', 'Amanda Foster', 'Christopher Lee',
  'Jennifer Miller', 'Daniel Brooks', 'Ashley Martinez', 'Matthew Turner', 'Lauren Wright'
];

const locations = [
  'San Francisco, CA', 'New York, NY', 'Austin, TX', 'Seattle, WA', 'Boston, MA',
  'Los Angeles, CA', 'Chicago, IL', 'Miami, FL', 'Denver, CO', 'Portland, OR',
  'Atlanta, GA', 'Nashville, TN', 'San Diego, CA', 'Phoenix, AZ', 'Dallas, TX'
];

const actions = [
  'booked a Premium Placement',
  'scheduled a strategy call',
  'joined the Pro plan',
  'booked 3 premium shows',
  'started their podcast tour',
  'booked The Executive Edge',
  'secured a Featured placement'
];

const timeFrames = [
  '2 minutes ago',
  '5 minutes ago',
  '8 minutes ago',
  '12 minutes ago',
  '18 minutes ago',
  '23 minutes ago',
  '34 minutes ago',
  '1 hour ago'
];

const getRandomItem = <T,>(array: T[]): T => {
  return array[Math.floor(Math.random() * array.length)];
};

const generateNotification = (): Notification => {
  return {
    id: Math.random().toString(36).substr(2, 9),
    name: getRandomItem(names),
    location: getRandomItem(locations),
    action: getRandomItem(actions),
    timeAgo: getRandomItem(timeFrames),
    show: false
  };
};

export const SocialProofNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    // Show first notification after 5 seconds
    const initialTimeout = setTimeout(() => {
      const notification = generateNotification();
      setNotifications([{ ...notification, show: true }]);

      // Auto-hide after 6 seconds
      setTimeout(() => {
        setNotifications(prev =>
          prev.map(n => n.id === notification.id ? { ...n, show: false } : n)
        );
        // Remove from DOM after animation
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== notification.id));
        }, 300);
      }, 6000);
    }, 5000);

    // Then show new notification every 15-25 seconds
    const interval = setInterval(() => {
      const notification = generateNotification();
      setNotifications(prev => [...prev, { ...notification, show: true }]);

      // Auto-hide after 6 seconds
      setTimeout(() => {
        setNotifications(prev =>
          prev.map(n => n.id === notification.id ? { ...n, show: false } : n)
        );
        // Remove from DOM after animation
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== notification.id));
        }, 300);
      }, 6000);
    }, Math.random() * 10000 + 15000); // Random between 15-25 seconds

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  const dismissNotification = (id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, show: false } : n)
    );
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 300);
  };

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-3 pointer-events-none">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`
            pointer-events-auto
            max-w-sm
            bg-background
            border-2 border-border
            rounded-xl
            shadow-2xl
            p-4
            transition-all
            duration-300
            ${notification.show
              ? 'translate-x-0 opacity-100'
              : '-translate-x-full opacity-0'
            }
          `}
        >
          <div className="flex items-start gap-3">
            {/* Avatar */}
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {notification.name.split(' ').map(n => n[0]).join('')}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {notification.name}
                  </p>
                  <p className="text-xs text-muted-foreground mb-1">
                    {notification.location}
                  </p>
                  <div className="flex items-center gap-1.5 text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                    <span className="line-clamp-1">{notification.action}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {notification.timeAgo}
                  </p>
                </div>

                {/* Close button */}
                <button
                  onClick={() => dismissNotification(notification.id)}
                  className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
                  aria-label="Dismiss notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
