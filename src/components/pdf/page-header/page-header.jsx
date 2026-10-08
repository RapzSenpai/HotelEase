import {
  usePdfcnTheme,
  useSafeMemo,
} from "@/components/pdf/theme-provider";
import {
  Text as PDFText,
  StyleSheet,
  View,
} from "@/lib/pdf-primitives";
import { resolveColor } from "@/lib/resolve-color";

const createPageHeaderStyles = (t) => {
  const { spacing, borderRadius, fontWeights } = t.primitives;
  const c = t.colors;
  const { heading, body } = t.typography;

  return StyleSheet.create({
    brandedContainer: {
      alignItems: "center",
      backgroundColor: c.primary,
      borderRadius: borderRadius.sm,
      display: "flex",
      flexDirection: "column",
      padding: spacing[6],
    },
    centeredContainer: {
      alignItems: "center",
      borderBottomColor: c.border,
      borderBottomStyle: "solid",
      borderBottomWidth: spacing[0.5],
      display: "flex",
      flexDirection: "column",
      paddingBottom: spacing[4],
    },
    contactInfo: {
      color: c.mutedForeground,
      fontFamily: body.fontFamily,
      fontSize: t.primitives.typography.xs,
      marginTop: spacing[0.5],
      textAlign: "right",
    },

    logoContainer: {
      height: 48,
      marginRight: spacing[4],
      width: 48,
    },

    logoContent: {
      display: "flex",
      flex: 1,
      flexDirection: "column",
    },
    logoLeftContainer: {
      alignItems: "center",
      borderBottomColor: c.border,
      borderBottomStyle: "solid",
      borderBottomWidth: spacing[0.5],
      display: "flex",
      flexDirection: "row",
      paddingBottom: spacing[4],
    },
    logoRightContainer: {
      alignItems: "center",
      borderBottomColor: c.border,
      borderBottomStyle: "solid",
      borderBottomWidth: spacing[0.5],
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: spacing[4],
    },

    logoRightContent: {
      display: "flex",
      flex: 1,
      flexDirection: "column",
    },

    logoRightLogoContainer: {
      height: 48,
      marginLeft: spacing[4],
      width: 48,
    },
    minimalContainer: {
      alignItems: "center",
      borderBottomColor: c.primary,
      borderBottomStyle: "solid",
      borderBottomWidth: spacing[1],
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: spacing[3],
    },
    minimalLeft: {
      flex: 1,
    },
    minimalRight: {
      alignItems: "flex-end",
    },

    rightSubText: {
      color: c.mutedForeground,
      fontFamily: body.fontFamily,
      fontSize: t.primitives.typography.xs,
      marginTop: spacing[1],
      textAlign: "right",
    },
    rightText: {
      color: c.foreground,
      fontFamily: body.fontFamily,
      fontSize: body.fontSize,
      fontWeight: fontWeights.medium,
      textAlign: "right",
    },
    simpleContainer: {
      alignItems: "flex-start",
      borderBottomColor: c.border,
      borderBottomStyle: "solid",
      borderBottomWidth: spacing[0.5],
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: spacing[4],
    },

    simpleLeft: {
      display: "flex",
      flex: 1,
      flexDirection: "column",
    },
    simpleRight: {
      alignItems: "flex-end",
      display: "flex",
      flexDirection: "column",
    },

    subtitle: {
      color: c.mutedForeground,
      fontFamily: body.fontFamily,
      fontSize: body.fontSize,
      lineHeight: body.lineHeight,
      marginTop: spacing[1],
    },
    subtitleBranded: {
      color: c.primaryForeground,
      marginTop: spacing[1],
    },
    subtitleCentered: {
      textAlign: "center",
    },

    title: {
      color: c.foreground,
      fontFamily: heading.fontFamily,
      fontSize: heading.fontSize.h3,
      fontWeight: fontWeights.bold,
      lineHeight: heading.lineHeight,
      marginBottom: 0,
    },
    titleBranded: {
      color: c.primaryForeground,
    },
    titleCentered: {
      textAlign: "center",
    },

    titleMinimal: {
      fontSize: heading.fontSize.h3,
      fontWeight: fontWeights.bold,
    },
    twoColumnContainer: {
      alignItems: "flex-start",
      borderBottomColor: c.border,
      borderBottomStyle: "solid",
      borderBottomWidth: spacing[0.5],
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: spacing[4],
    },
    twoColumnLeft: {
      display: "flex",
      flex: 1,
      flexDirection: "column",
    },
    twoColumnRight: {
      alignItems: "flex-end",
      display: "flex",
      flexDirection: "column",
    },
  });
};

const buildContainerStyles = (base, mb, background, theme, style, ...extras) => {
  const result = [base, { marginBottom: mb }, ...extras];
  if (background) {
    result.push({ backgroundColor: resolveColor(background, theme.colors) });
  }
  if (style) {
    result.push(style);
  }
  return result;
};

const buildTitleStyles = (base, titleColor, theme) => {
  if (!titleColor) {
    return base;
  }
  return [...base, { color: resolveColor(titleColor, theme.colors) }];
};

const renderBranded = (
  styles,
  containerStyles,
  titleStyles,
  title,
  subtitle,
  noWrap
) => (
  <View wrap={!noWrap} style={containerStyles}>
    <PDFText style={titleStyles}>{title}</PDFText>
    {subtitle && (
      <PDFText style={[styles.subtitle, styles.subtitleBranded]}>
        {subtitle}
      </PDFText>
    )}
  </View>
);

const renderCentered = (
  styles,
  containerStyles,
  titleStyles,
  title,
  subtitle,
  noWrap
) => (
  <View wrap={!noWrap} style={containerStyles}>
    <PDFText style={titleStyles}>{title}</PDFText>
    {subtitle && (
      <PDFText style={[styles.subtitle, styles.subtitleCentered]}>
        {subtitle}
      </PDFText>
    )}
  </View>
);

const renderLogoRight = (
  styles,
  containerStyles,
  titleStyles,
  title,
  subtitle,
  logo,
  noWrap
) => (
  <View wrap={!noWrap} style={containerStyles}>
    <View style={styles.logoRightContent}>
      <PDFText style={titleStyles}>{title}</PDFText>
      {subtitle && <PDFText style={styles.subtitle}>{subtitle}</PDFText>}
    </View>
    {logo && <View style={styles.logoRightLogoContainer}>{logo}</View>}
  </View>
);

const renderLogoLeft = (
  styles,
  containerStyles,
  titleStyles,
  title,
  subtitle,
  logo,
  rightText,
  rightSubText,
  noWrap
) => (
  <View wrap={!noWrap} style={containerStyles}>
    {logo && <View style={styles.logoContainer}>{logo}</View>}
    <View style={styles.logoContent}>
      <PDFText style={titleStyles}>{title}</PDFText>
      {subtitle && <PDFText style={styles.subtitle}>{subtitle}</PDFText>}
    </View>
    {(rightText || rightSubText) && (
      <View style={styles.simpleRight}>
        {rightText && <PDFText style={styles.rightText}>{rightText}</PDFText>}
        {rightSubText && (
          <PDFText style={styles.rightSubText}>{rightSubText}</PDFText>
        )}
      </View>
    )}
  </View>
);

const renderTwoColumn = (
  styles,
  containerStyles,
  titleStyles,
  title,
  subtitle,
  address,
  phone,
  email,
  noWrap
) => (
  <View wrap={!noWrap} style={containerStyles}>
    <View style={styles.twoColumnLeft}>
      <PDFText style={titleStyles}>{title}</PDFText>
      {subtitle && <PDFText style={styles.subtitle}>{subtitle}</PDFText>}
    </View>
    {(address || phone || email) && (
      <View style={styles.twoColumnRight}>
        {address && <PDFText style={styles.contactInfo}>{address}</PDFText>}
        {phone && <PDFText style={styles.contactInfo}>{phone}</PDFText>}
        {email && <PDFText style={styles.contactInfo}>{email}</PDFText>}
      </View>
    )}
  </View>
);

const renderMinimal = (
  styles,
  containerStyles,
  titleStyles,
  title,
  subtitle,
  rightText,
  rightSubText,
  noWrap
) => (
  <View wrap={!noWrap} style={containerStyles}>
    <View style={styles.minimalLeft}>
      <PDFText style={titleStyles}>{title}</PDFText>
      {subtitle && <PDFText style={styles.subtitle}>{subtitle}</PDFText>}
    </View>
    {(rightText || rightSubText) && (
      <View style={styles.minimalRight}>
        {rightText && <PDFText style={styles.rightText}>{rightText}</PDFText>}
        {rightSubText && (
          <PDFText style={styles.rightSubText}>{rightSubText}</PDFText>
        )}
      </View>
    )}
  </View>
);

const renderSimple = (
  styles,
  containerStyles,
  titleStyles,
  title,
  subtitle,
  rightText,
  rightSubText,
  noWrap
) => (
  <View wrap={!noWrap} style={containerStyles}>
    <View style={styles.simpleLeft}>
      <PDFText style={titleStyles}>{title}</PDFText>
      {subtitle && <PDFText style={styles.subtitle}>{subtitle}</PDFText>}
    </View>
    {(rightText || rightSubText) && (
      <View style={styles.simpleRight}>
        {rightText && <PDFText style={styles.rightText}>{rightText}</PDFText>}
        {rightSubText && (
          <PDFText style={styles.rightSubText}>{rightSubText}</PDFText>
        )}
      </View>
    )}
  </View>
);

export const PageHeader = ({
  title,
  subtitle,
  rightText,
  rightSubText,
  variant = "simple",
  background,
  titleColor,
  marginBottom,
  logo,
  address,
  phone,
  email,
  noWrap = true,
  style
}) => {
  const theme = usePdfcnTheme();
  const styles = useSafeMemo(() => createPageHeaderStyles(theme), [theme]);
  const mb = marginBottom ?? theme.spacing.sectionGap;

  const variantRenderers = {
    branded: () =>
      renderBranded(
        styles,
        buildContainerStyles(
          styles.brandedContainer,
          mb,
          background,
          theme,
          style
        ),
        buildTitleStyles(
          [styles.title, styles.titleBranded, styles.titleCentered],
          titleColor,
          theme
        ),
        title,
        subtitle,
        noWrap
      ),
    centered: () =>
      renderCentered(
        styles,
        buildContainerStyles(
          styles.centeredContainer,
          mb,
          background,
          theme,
          style
        ),
        buildTitleStyles(
          [styles.title, styles.titleCentered],
          titleColor,
          theme
        ),
        title,
        subtitle,
        noWrap
      ),
    "logo-left": () =>
      renderLogoLeft(
        styles,
        buildContainerStyles(
          styles.logoLeftContainer,
          mb,
          background,
          theme,
          style
        ),
        buildTitleStyles([styles.title], titleColor, theme),
        title,
        subtitle,
        logo,
        rightText,
        rightSubText,
        noWrap
      ),
    "logo-right": () =>
      renderLogoRight(
        styles,
        buildContainerStyles(
          styles.logoRightContainer,
          mb,
          background,
          theme,
          style
        ),
        buildTitleStyles([styles.title], titleColor, theme),
        title,
        subtitle,
        logo,
        noWrap
      ),
    minimal: () =>
      renderMinimal(
        styles,
        buildContainerStyles(
          styles.minimalContainer,
          mb,
          background,
          theme,
          style
        ),
        buildTitleStyles(
          [styles.title, styles.titleMinimal],
          titleColor,
          theme
        ),
        title,
        subtitle,
        rightText,
        rightSubText,
        noWrap
      ),
    simple: () =>
      renderSimple(
        styles,
        buildContainerStyles(
          styles.simpleContainer,
          mb,
          background,
          theme,
          style
        ),
        buildTitleStyles([styles.title], titleColor, theme),
        title,
        subtitle,
        rightText,
        rightSubText,
        noWrap
      ),
    "two-column": () =>
      renderTwoColumn(
        styles,
        buildContainerStyles(
          styles.twoColumnContainer,
          mb,
          background,
          theme,
          style
        ),
        buildTitleStyles([styles.title], titleColor, theme),
        title,
        subtitle,
        address,
        phone,
        email,
        noWrap
      ),
  };

  return variantRenderers[variant]();
};
