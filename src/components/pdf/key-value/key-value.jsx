import {
  usePdfcnTheme,
  useSafeMemo,
} from "@/components/pdf/theme-provider";
import {
  View,
  Text as PDFText,
  StyleSheet,
} from "@/lib/pdf-primitives";
import { resolveColor } from "@/lib/resolve-color";

const createKeyValueStyles = (t) => {
  const { spacing, fontWeights } = t.primitives;
  const c = t.colors;
  const { body } = t.typography;
  const keyBase = {
    color: c.mutedForeground,
    fontFamily: body.fontFamily,
    fontWeight: fontWeights.medium,
  };
  const valueBase = {
    color: c.foreground,
    fontFamily: body.fontFamily,
    fontWeight: fontWeights.regular,
  };
  return StyleSheet.create({
    container: { flexDirection: "column" },
    divider: {
      borderBottomColor: c.border,
      borderBottomStyle: "solid",
      borderBottomWidth: spacing[0.5],
    },
    keyLg: { ...keyBase, fontSize: t.primitives.typography.base },
    keyMd: { ...keyBase, fontSize: body.fontSize },
    keySm: { ...keyBase, fontSize: t.primitives.typography.xs },
    rowHorizontal: {
      alignItems: "flex-start",
      flexDirection: "row",
      paddingVertical: spacing[1],
    },
    rowVertical: {
      flexDirection: "column",
      marginBottom: t.spacing.paragraphGap,
    },
    valueBold: { fontWeight: fontWeights.bold },
    valueLg: { ...valueBase, fontSize: t.primitives.typography.base },
    valueMd: { ...valueBase, fontSize: body.fontSize },
    valueSm: { ...valueBase, fontSize: t.primitives.typography.xs },
  });
};

export const KeyValue = ({
  items,
  direction = "horizontal",
  divided = false,
  size = "md",
  labelFlex = 1,
  labelColor,
  valueColor,
  boldValue = false,
  noWrap = false,
  dividerColor,
  dividerThickness,
  dividerMargin,
  style
}) => {
  const theme = usePdfcnTheme();
  const styles = useSafeMemo(() => createKeyValueStyles(theme), [theme]);
  const keyStyleMap = {
    lg: styles.keyLg,
    md: styles.keyMd,
    sm: styles.keySm
  };
  const valueStyleMap = {
    lg: styles.valueLg,
    md: styles.valueMd,
    sm: styles.valueSm
  };
  const containerStyles = [styles.container];
  if (style) {
    containerStyles.push(...[style].flat());
  }

  return (
    <View wrap={!noWrap} style={containerStyles}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const keyStyles = [keyStyleMap[size]];
        if (labelColor) {
          keyStyles.push({ color: resolveColor(labelColor, theme.colors) });
        }
        if (item.keyStyle) {
          keyStyles.push(item.keyStyle);
        }
        const valStyles = [valueStyleMap[size]];
        if (boldValue) {
          valStyles.push(styles.valueBold);
        }
        const resolvedValueColor = item.valueColor ?? valueColor;
        if (resolvedValueColor) {
          valStyles.push({
            color: resolveColor(resolvedValueColor, theme.colors),
          });
        }
        if (item.valueStyle) {
          valStyles.push(item.valueStyle);
        }

        if (direction === "horizontal") {
          const rowStyles = [styles.rowHorizontal];
          if (divided && !isLast) {
            const dividerStyle = {};
            if (dividerColor) {
              dividerStyle.borderBottomColor = resolveColor(
                dividerColor,
                theme.colors
              );
            }
            if (dividerThickness) {
              dividerStyle.borderBottomWidth = dividerThickness;
            }
            if (dividerMargin) {
              dividerStyle.marginBottom = dividerMargin;
            }
            rowStyles.push({ ...styles.divider, ...dividerStyle });
          }
          return (
            <View key={item.key} style={rowStyles}>
              <PDFText style={[...keyStyles, { flex: labelFlex }]}>
                {item.key}
              </PDFText>
              <PDFText style={[...valStyles, { flex: 1, textAlign: "right" }]}>
                {item.value}
              </PDFText>
            </View>
          );
        }

        const rowStyles = [styles.rowVertical];
        if (divided && !isLast) {
          rowStyles.push(styles.divider);
        }
        return (
          <View key={item.key} style={rowStyles}>
            <PDFText style={keyStyles}>{item.key}</PDFText>
            <PDFText style={valStyles}>{item.value}</PDFText>
          </View>
        );
      })}
    </View>
  );
};
