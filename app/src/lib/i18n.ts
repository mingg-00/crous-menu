import { getLocales } from 'expo-localization';

const en = {
  nearby: 'Nearby restaurants',
  noMenu: 'No menu published for today.',
  locationDenied: 'Allow location access to find restaurants near you.',
  loadError: 'Could not load. Pull down to retry.',
  meals: { matin: 'Breakfast', midi: 'Lunch', soir: 'Dinner' } as Record<string, string>,
  reviewsTitle: "Today's lunch reviews",
  noReviews: 'No reviews yet.',
  loginToReview: 'Log in to review',
  commentPlaceholder: 'How was it? (optional)',
  submit: 'Post review',
  update: 'Update review',
  delete: 'Delete',
  logout: 'Log out',
  reviewError: 'Could not save. Please try again.',
  login: 'Log in',
  continueWithGoogle: 'Continue with Google',
};

const strings: Record<string, typeof en> = {
  en,
  fr: {
    nearby: 'Restaurants à proximité',
    noMenu: "Aucun menu publié pour aujourd'hui.",
    locationDenied: 'Autorisez la localisation pour trouver les restaurants proches.',
    loadError: 'Chargement impossible. Tirez vers le bas pour réessayer.',
    meals: { matin: 'Petit-déjeuner', midi: 'Déjeuner', soir: 'Dîner' },
    reviewsTitle: 'Avis sur le déjeuner du jour',
    noReviews: "Pas encore d'avis.",
    loginToReview: 'Connectez-vous pour donner votre avis',
    commentPlaceholder: "C'était comment ? (facultatif)",
    submit: 'Publier',
    update: 'Modifier mon avis',
    delete: 'Supprimer',
    logout: 'Se déconnecter',
    reviewError: "Échec de l'enregistrement. Réessayez.",
    login: 'Connexion',
    continueWithGoogle: 'Continuer avec Google',
  },
  ko: {
    nearby: '주변 식당',
    noMenu: '오늘 등록된 메뉴가 없습니다.',
    locationDenied: '주변 식당을 찾으려면 위치 권한을 허용해 주세요.',
    loadError: '불러오지 못했습니다. 아래로 당겨 다시 시도하세요.',
    meals: { matin: '아침', midi: '점심', soir: '저녁' },
    reviewsTitle: '오늘 점심 리뷰',
    noReviews: '아직 리뷰가 없습니다.',
    loginToReview: '로그인하고 리뷰 남기기',
    commentPlaceholder: '어땠나요? (선택)',
    submit: '리뷰 등록',
    update: '리뷰 수정',
    delete: '삭제',
    logout: '로그아웃',
    reviewError: '저장하지 못했습니다. 다시 시도해 주세요.',
    login: '로그인',
    continueWithGoogle: 'Google로 계속하기',
  },
};

const code = getLocales()[0]?.languageCode ?? 'en';
export const lang = code in strings ? code : 'en';
export const t = strings[lang];
