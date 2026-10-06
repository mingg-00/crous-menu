import { getLocales } from 'expo-localization';

const en = {
  nearby: 'Nearby restaurants',
  noMenu: 'No menu published for today.',
  locationDenied: 'Allow location access to find restaurants near you.',
  loadError: 'Could not load. Pull down to retry.',
  meals: { matin: 'Breakfast', midi: 'Lunch', soir: 'Dinner' } as Record<string, string>,
};

const strings: Record<string, typeof en> = {
  en,
  fr: {
    nearby: 'Restaurants à proximité',
    noMenu: "Aucun menu publié pour aujourd'hui.",
    locationDenied: 'Autorisez la localisation pour trouver les restaurants proches.',
    loadError: 'Chargement impossible. Tirez vers le bas pour réessayer.',
    meals: { matin: 'Petit-déjeuner', midi: 'Déjeuner', soir: 'Dîner' },
  },
  ko: {
    nearby: '주변 식당',
    noMenu: '오늘 등록된 메뉴가 없습니다.',
    locationDenied: '주변 식당을 찾으려면 위치 권한을 허용해 주세요.',
    loadError: '불러오지 못했습니다. 아래로 당겨 다시 시도하세요.',
    meals: { matin: '아침', midi: '점심', soir: '저녁' },
  },
};

export const t = strings[getLocales()[0]?.languageCode ?? 'en'] ?? en;
