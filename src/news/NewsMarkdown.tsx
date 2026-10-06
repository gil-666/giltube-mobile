import { useMemo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, makeStyles, radii, withAlpha } from '@/theme/tokens';

import { parseMarkdown, type MarkdownBlock, type MarkdownInline } from './markdown';
import { openNewsLink } from './navigation';

/** Renders news Markdown (see ./markdown.ts) as native text and views. */
export function NewsMarkdown({ source }: { source: string }) {
  const styles = useStyles();
  const blocks = useMemo(() => parseMarkdown(source || ''), [source]);
  return <View style={styles.root}>{blocks.map((block, index) => <Block key={index} block={block} first={index === 0} />)}</View>;
}

function Block({ block, first }: { block: MarkdownBlock; first: boolean }) {
  const styles = useStyles();
  const spacing = first ? undefined : styles.spaced;
  switch (block.type) {
    case 'heading':
      return <Text accessibilityRole="header" style={[styles.heading, block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3, spacing]}><Inlines nodes={block.children} /></Text>;
    case 'paragraph':
      return <Text style={[styles.paragraph, spacing]}><Inlines nodes={block.children} /></Text>;
    case 'quote':
      return <View style={[styles.quote, spacing]}><Text style={styles.quoteText}><Inlines nodes={block.children} /></Text></View>;
    case 'list':
      return <View style={[styles.list, spacing]}>
        {block.items.map((item, index) => <View key={index} style={styles.listItem}>
          <Text style={[styles.paragraph, styles.marker]}>{block.ordered ? `${index + 1}.` : '•'}</Text>
          <Text style={[styles.paragraph, styles.listText]}><Inlines nodes={item} /></Text>
        </View>)}
      </View>;
    case 'code':
      return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.codeBlock, spacing]} contentContainerStyle={styles.codeBlockContent}>
        <Text style={styles.codeBlockText}>{block.text}</Text>
      </ScrollView>;
    case 'hr':
      return <View style={[styles.hr, spacing]} />;
    default:
      return null;
  }
}

function Inlines({ nodes }: { nodes: MarkdownInline[] }) {
  return <>{nodes.map((node, index) => <Inline key={index} node={node} />)}</>;
}

function Inline({ node }: { node: MarkdownInline }): ReactNode {
  const styles = useStyles();
  switch (node.type) {
    case 'text':
      return node.text;
    case 'br':
      return '\n';
    case 'strong':
      return <Text style={styles.strong}><Inlines nodes={node.children} /></Text>;
    case 'em':
      return <Text style={styles.em}><Inlines nodes={node.children} /></Text>;
    case 'strike':
      return <Text style={styles.strike}><Inlines nodes={node.children} /></Text>;
    case 'code':
      return <Text style={styles.code}>{node.text}</Text>;
    case 'link':
      return <Text accessibilityRole="link" style={styles.link} onPress={() => openNewsLink(node.href, node.external)}><Inlines nodes={node.children} />{node.external ? ' ↗' : ''}</Text>;
    default:
      return null;
  }
}

const useStyles = makeStyles(() => ({
  root: { alignSelf: 'stretch' },
  spaced: { marginTop: 12 },
  heading: { color: colors.text, fontWeight: '900' },
  h1: { fontSize: 22, lineHeight: 28 },
  h2: { fontSize: 18, lineHeight: 24 },
  h3: { fontSize: 15, lineHeight: 21 },
  paragraph: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  strong: { color: colors.text, fontWeight: '800' },
  em: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  code: { fontFamily: 'monospace', fontSize: 13, color: colors.text, backgroundColor: withAlpha(colors.text, 0.08) },
  link: { color: colors.highlight, fontWeight: '700', textDecorationLine: 'underline' },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.accentBright, paddingLeft: 12, paddingVertical: 2 },
  quoteText: { color: colors.textMuted, fontSize: 15, lineHeight: 22, fontStyle: 'italic' },
  list: { gap: 6 },
  listItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  marker: { minWidth: 16, color: colors.textDim, fontWeight: '800' },
  listText: { flex: 1 },
  codeBlock: { borderRadius: radii.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.canvasRaised },
  codeBlockContent: { padding: 12 },
  codeBlockText: { fontFamily: 'monospace', fontSize: 12, lineHeight: 18, color: colors.text },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
}));
