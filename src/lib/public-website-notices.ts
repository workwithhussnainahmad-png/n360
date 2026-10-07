export type WebsiteEventPopup = {
  enabled: boolean;
  title: string;
  description: string;
  imageUrl: string;
  dateTime: string;
  venue: string;
  buttonText: string;
  buttonUrl: string;
};

export type WebsiteUrgentAlert = {
  enabled: boolean;
  message: string;
  buttonText: string;
  buttonUrl: string;
};

export type WebsiteUpcomingEvent = {
  title: string;
  description: string;
  dateTime: string;
  venue: string;
  buttonText: string;
  buttonUrl: string;
};

export type WebsiteUpcomingEventsPopup = {
  enabled: boolean;
  heading: string;
  events: WebsiteUpcomingEvent[];
};

export type WebsitePublishedTimetable = {
  enabled: boolean;
  imageUrl: string;
};

export type WebsiteNotices = {
  eventPopup: WebsiteEventPopup;
  urgentAlert: WebsiteUrgentAlert;
  upcomingEventsPopup: WebsiteUpcomingEventsPopup;
  publishedTimetable: WebsitePublishedTimetable;
};

export const EMPTY_WEBSITE_NOTICES: WebsiteNotices = {
  eventPopup: {
    enabled: false,
    title: '',
    description: '',
    imageUrl: '',
    dateTime: '',
    venue: '',
    buttonText: '',
    buttonUrl: '',
  },
  urgentAlert: {
    enabled: false,
    message: '',
    buttonText: '',
    buttonUrl: '',
  },
  upcomingEventsPopup: {
    enabled: false,
    heading: '',
    events: [],
  },
  publishedTimetable: {
    enabled: false,
    imageUrl: '',
  },
};

export function normalizeWebsiteNotices(value: WebsiteNotices | null | undefined): WebsiteNotices {
  return {
    eventPopup: { ...EMPTY_WEBSITE_NOTICES.eventPopup, ...value?.eventPopup },
    urgentAlert: { ...EMPTY_WEBSITE_NOTICES.urgentAlert, ...value?.urgentAlert },
    upcomingEventsPopup: {
      ...EMPTY_WEBSITE_NOTICES.upcomingEventsPopup,
      ...value?.upcomingEventsPopup,
      events: value?.upcomingEventsPopup?.events || [],
    },
    publishedTimetable: {
      ...EMPTY_WEBSITE_NOTICES.publishedTimetable,
      ...value?.publishedTimetable,
    },
  };
}
