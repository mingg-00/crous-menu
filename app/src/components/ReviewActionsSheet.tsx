import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { t } from '../lib/i18n';
import { color, font, radius, space } from '../lib/theme';

type Step = 'menu' | 'report' | 'block';

function Row({ icon, label, onPress, danger }: { icon: string; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Text style={styles.rowIcon} aria-hidden>
        {icon}
      </Text>
      <Text style={[styles.rowText, danger && styles.danger]}>{label}</Text>
    </Pressable>
  );
}

/** What you can do about someone else's review: report it (then pick why) or block its author (then confirm).
 * A bottom sheet on phones, a centered card on wide screens; tapping outside or Cancel closes it. */
export function ReviewActionsSheet({
  visible,
  onClose,
  onReport,
  onBlock,
}: {
  visible: boolean;
  onClose: () => void;
  onReport: (reason: 'spam' | 'offensive') => void;
  onBlock: () => void;
}) {
  const [step, setStep] = useState<Step>('menu');
  const { width } = useWindowDimensions();
  const wide = width >= 600;

  useEffect(() => {
    if (visible) setStep('menu'); // every opening starts from the first step
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, wide && styles.backdropWide]} onPress={onClose} accessibilityLabel={t.cancel}>
        {/* Inner Pressable swallows taps so only the backdrop closes the sheet. */}
        <Pressable style={[styles.sheet, wide && styles.sheetWide]} accessibilityViewIsModal>
          {!wide && <View style={styles.handle} />}
          {step === 'menu' && (
            <View style={styles.group}>
              <Row icon="🚩" label={t.report} onPress={() => setStep('report')} />
              <View style={styles.separator} />
              <Row icon="🚫" label={t.block} danger onPress={() => setStep('block')} />
            </View>
          )}
          {step === 'report' && (
            <>
              <Text style={styles.title} accessibilityRole="header">
                {t.reportReason}
              </Text>
              <View style={styles.group}>
                <Row icon="📢" label={t.reportSpam} onPress={() => onReport('spam')} />
                <View style={styles.separator} />
                <Row icon="⚠️" label={t.reportOffensive} onPress={() => onReport('offensive')} />
              </View>
            </>
          )}
          {step === 'block' && (
            <>
              <Text style={styles.title} accessibilityRole="header">
                {t.block}
              </Text>
              <Text style={styles.body}>{t.blockConfirm}</Text>
              <Pressable
                onPress={onBlock}
                accessibilityRole="button"
                style={({ pressed }) => [styles.dangerButton, pressed && styles.dangerButtonPressed]}>
                <Text style={styles.dangerButtonText}>{t.block}</Text>
              </Pressable>
            </>
          )}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cancel, pressed && styles.rowPressed]}>
            <Text style={styles.cancelText}>{t.cancel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(28,21,23,0.45)' },
  backdropWide: { justifyContent: 'center', alignItems: 'center', padding: space.lg },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.md + 6,
    borderTopRightRadius: radius.md + 6,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    gap: space.md,
  },
  sheetWide: { width: '100%', maxWidth: 400, borderRadius: radius.md + 6, paddingTop: space.lg },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: color.line, marginBottom: space.xs },
  title: { ...font.title, color: color.ink },
  body: { ...font.body, color: color.ink2 },
  group: { backgroundColor: color.bg, borderRadius: radius.md, overflow: 'hidden' },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  rowPressed: { backgroundColor: color.brandTint },
  rowIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  rowText: { ...font.bodyStrong, color: color.ink },
  danger: { color: color.danger },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: color.line, marginLeft: space.lg + 24 + space.md },
  dangerButton: { minHeight: 48, borderRadius: radius.pill, backgroundColor: color.danger, alignItems: 'center', justifyContent: 'center' },
  dangerButtonPressed: { opacity: 0.85 },
  dangerButtonText: { ...font.bodyStrong, color: '#fff' },
  cancel: { minHeight: 48, borderRadius: radius.pill, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...font.bodyStrong, color: color.ink },
});
