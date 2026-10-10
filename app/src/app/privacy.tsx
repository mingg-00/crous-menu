import { ScrollView, StyleSheet, Text } from 'react-native';

import { lang } from '../lib/i18n';
import { color, font, MAX_WIDTH, space } from '../lib/theme';

// Fill in before publishing: GDPR requires the controller's identity and a contact address.
const CONTROLLER = 'Minji KIM';
const CONTACT_EMAIL = 'minji04@kyonggi.ac.kr';
const HOSTING = '[호스팅 업체]'; // the API server's host, once deployed
const UPDATED = '2026-10-10';

type Section = [title: string, body: string];

const en: Section[] = [
  ['Who we are', `Resto U Menu is a free, non-commercial app, not affiliated with the Crous network, made by ${CONTROLLER} (individual developer). Contact: ${CONTACT_EMAIL}.`],
  ['What we collect',
    '• Account: when you sign in with Google, our login provider Supabase stores your email address, name and profile picture from Google. Our server only uses an internal account ID.\n' +
    '• Reviews you post: rating, optional comment, restaurant, date and time. Reviews are shown to other users without your name.\n' +
    '• Reports and blocks you make, so the reviews you reported or blocked stay hidden for you.\n' +
    '• Location: only used to sort restaurants by distance. Your coordinates are sent to our server for that request and are not stored. You can refuse location access; the app then sorts from the Talence campus.\n' +
    '• Your login session is kept on your device or in your browser.'],
  ['What we don\'t do', 'No ads, no analytics, no tracking, no selling or sharing of data for marketing.'],
  ['Who processes data for us',
    `• Supabase (login), servers in the EU (Paris).\n• OpenAI (USA): menu texts for translation, and review comments for automatic abuse filtering. No account information is sent. Under OpenAI's API policy this data is not used to train its models.\n• ${HOSTING}: hosts our server and database.\n• Menus come from the public CROUStillant API; no personal data is sent to it.`],
  ['Why (legal basis)', 'To provide the service you sign up for (contract), and to keep reviews free of abuse (legitimate interest).'],
  ['How long', 'Your account, reviews, reports and blocks are kept until you delete your account. "Delete my account" in the app removes all of it immediately, including your login account.'],
  ['Your rights', `You can access, correct, export or delete your data, and object to its processing, by writing to ${CONTACT_EMAIL}. You can also complain to your data protection authority (in France: CNIL, cnil.fr).`],
  ['Age', 'The app is not intended for children under 15.'],
  ['Changes', `We will update this page if anything changes. Last updated: ${UPDATED}.`],
];

const fr: Section[] = [
  ['Qui sommes-nous', `Resto U Menu est une application gratuite et non commerciale, sans lien avec le réseau des Crous, développée par ${CONTROLLER} (développeur individuel). Contact : ${CONTACT_EMAIL}.`],
  ['Données collectées',
    '• Compte : lorsque vous vous connectez avec Google, notre prestataire de connexion Supabase conserve votre adresse e-mail, votre nom et votre photo de profil Google. Notre serveur n\'utilise qu\'un identifiant interne.\n' +
    '• Vos avis : note, commentaire facultatif, restaurant, date et heure. Les avis sont affichés sans votre nom.\n' +
    '• Vos signalements et blocages, afin que les avis signalés ou bloqués restent masqués pour vous.\n' +
    '• Localisation : utilisée uniquement pour trier les restaurants par distance. Vos coordonnées sont envoyées à notre serveur pour cette requête et ne sont pas conservées. Vous pouvez refuser ; l\'application trie alors depuis le campus de Talence.\n' +
    '• Votre session de connexion est conservée sur votre appareil ou dans votre navigateur.'],
  ['Ce que nous ne faisons pas', 'Pas de publicité, pas de mesure d\'audience, pas de pistage, aucune vente ni partage de données à des fins marketing.'],
  ['Sous-traitants',
    `• Supabase (connexion), serveurs dans l'UE (Paris).\n• OpenAI (États-Unis) : textes des menus pour la traduction et commentaires des avis pour le filtrage automatique des abus. Aucune donnée de compte n'est envoyée. Selon la politique API d'OpenAI, ces données ne servent pas à entraîner ses modèles.\n• ${HOSTING} : hébergement de notre serveur et de notre base de données.\n• Les menus proviennent de l'API publique CROUStillant ; aucune donnée personnelle ne lui est transmise.`],
  ['Base légale', 'Fournir le service auquel vous vous inscrivez (contrat) et protéger les avis contre les abus (intérêt légitime).'],
  ['Durée de conservation', 'Votre compte, vos avis, signalements et blocages sont conservés jusqu\'à la suppression de votre compte. « Supprimer mon compte » dans l\'application efface immédiatement le tout, y compris votre compte de connexion.'],
  ['Vos droits', `Vous pouvez accéder à vos données, les rectifier, les exporter ou les supprimer, et vous opposer à leur traitement, en écrivant à ${CONTACT_EMAIL}. Vous pouvez aussi adresser une réclamation à la CNIL (cnil.fr).`],
  ['Âge', 'L\'application ne s\'adresse pas aux enfants de moins de 15 ans.'],
  ['Modifications', `Cette page sera mise à jour en cas de changement. Dernière mise à jour : ${UPDATED}.`],
];

const ko: Section[] = [
  ['운영자', `Resto U Menu는 ${CONTROLLER}(개인 개발자)가 만든 무료·비상업 앱으로, Crous와 관계없는 비공식 앱입니다. 문의: ${CONTACT_EMAIL}`],
  ['수집하는 정보',
    '• 계정: Google로 로그인하면 로그인 서비스 Supabase가 Google에서 받은 이메일 주소, 이름, 프로필 사진을 저장합니다. 우리 서버는 내부 계정 ID만 사용합니다.\n' +
    '• 작성한 리뷰: 별점, 코멘트(선택), 식당, 날짜와 시간. 리뷰는 이름 없이 다른 사용자에게 보입니다.\n' +
    '• 신고·차단 기록: 신고하거나 차단한 리뷰가 계속 보이지 않도록 저장합니다.\n' +
    '• 위치: 식당을 거리순으로 정렬할 때만 사용합니다. 좌표는 해당 요청에만 서버로 보내고 저장하지 않습니다. 위치 권한을 거부하면 탈랑스 캠퍼스를 기준으로 정렬합니다.\n' +
    '• 로그인 상태는 기기 또는 브라우저에 저장됩니다.'],
  ['하지 않는 것', '광고, 이용 분석, 추적을 하지 않으며 마케팅 목적으로 정보를 판매하거나 공유하지 않습니다.'],
  ['처리를 맡기는 곳',
    `• Supabase(로그인): EU(파리) 서버\n• OpenAI(미국): 번역할 메뉴 텍스트, 부적절한 표현을 걸러내기 위한 리뷰 코멘트. 계정 정보는 보내지 않습니다. OpenAI API 정책에 따라 이 데이터는 모델 학습에 사용되지 않습니다.\n• ${HOSTING}: 서버와 데이터베이스 호스팅\n• 메뉴는 공개 API인 CROUStillant에서 가져오며, 개인정보는 보내지 않습니다.`],
  ['처리 근거', '요청하신 서비스를 제공하기 위해(계약), 그리고 리뷰를 악용으로부터 보호하기 위해(정당한 이익) 처리합니다.'],
  ['보관 기간', '계정, 리뷰, 신고·차단 기록은 계정을 삭제할 때까지 보관합니다. 앱의 "계정 삭제"를 누르면 로그인 계정을 포함해 모두 즉시 삭제됩니다.'],
  ['이용자의 권리', `${CONTACT_EMAIL}로 연락하시면 정보 열람, 정정, 내보내기, 삭제, 처리 거부를 요청할 수 있습니다. 개인정보 감독기관(프랑스: CNIL, 한국: 개인정보보호위원회)에 민원을 제기할 수도 있습니다.`],
  ['연령', '만 15세 미만은 이용 대상이 아닙니다.'],
  ['변경', `내용이 바뀌면 이 페이지를 업데이트합니다. 최종 수정일: ${UPDATED}`],
];

const sections = { en, fr, ko }[lang as 'en' | 'fr' | 'ko'] ?? en;

export default function Privacy() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {sections.map(([title, body]) => (
        <Text key={title}>
          <Text style={styles.title}>{title}{'\n'}</Text>
          <Text style={styles.body}>{body}</Text>
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', padding: space.lg, gap: space.lg },
  title: { ...font.bodyStrong, fontSize: 17, color: color.ink },
  body: { ...font.body, fontSize: 15, lineHeight: 23, color: color.ink2 },
});
