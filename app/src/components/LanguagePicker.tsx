import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { lang, LANGUAGES, setLang, t } from '../lib/i18n';
import { color, font, radius, shadow, space } from '../lib/theme';

/** Header button showing the current language; opens the list of all languages, each in its own name. */
export function LanguagePicker({ onChange }: { onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find(([code]) => code === lang)?.[1];

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${t.language}: ${current}`} hitSlop={8} style={styles.button}>
        <Text style={styles.buttonText}>🌐 {current}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.title} accessibilityRole="header">
              {t.language}
            </Text>
            <ScrollView>
              {LANGUAGES.map(([code, name]) => (
                <Pressable
                  key={code}
                  onPress={() => {
                    setOpen(false);
                    if (code !== lang) {
                      setLang(code);
                      onChange(code);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: code === lang }}
                  style={({ pressed }) => [styles.option, (pressed || code === lang) && styles.optionSelected]}>
                  <Text style={[styles.optionText, code === lang && styles.optionTextSelected]}>{name}</Text>
                  {code === lang && <Text style={styles.optionTextSelected}>✓</Text>}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Native headers inset headerRight already; the web header doesn't.
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm, marginRight: Platform.OS === 'web' ? space.sm : 0 },
  buttonText: { ...font.bodyStrong, color: color.ink },
  backdrop: { flex: 1, backgroundColor: 'rgba(28,21,23,0.4)', justifyContent: 'center', alignItems: 'center', padding: space.lg },
  sheet: { width: '100%', maxWidth: 360, maxHeight: '80%', backgroundColor: color.surface, borderRadius: radius.md, paddingVertical: space.md, ...shadow },
  title: { ...font.title, color: color.ink, paddingHorizontal: space.lg, paddingBottom: space.sm },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg },
  optionSelected: { backgroundColor: color.brandTint },
  optionText: { ...font.body, color: color.ink },
  optionTextSelected: { ...font.bodyStrong, color: color.brandPressed },
});
