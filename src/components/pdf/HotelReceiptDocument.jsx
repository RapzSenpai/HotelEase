/* eslint-disable react-refresh/only-export-components -- mapper + theme live with the document by design */
import { KeyValue } from "@/components/pdf/key-value/key-value";
import { PageFooter } from "@/components/pdf/page-footer/page-footer";
import { PageHeader } from "@/components/pdf/page-header/page-header";
import { Section } from "@/components/pdf/section/section";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/pdf/table/table";
import { Text } from "@/components/pdf/text/text";
import {
  PdfcnThemeProvider,
  usePdfcnTheme,
} from "@/components/pdf/theme-provider";
import { professionalTheme } from "@/lib/pdf-themes/professional";
import {
  View,
  StyleSheet,
  Document,
  Page,
} from "@/lib/pdf-primitives";

// Single accent, matches classic jsPDF receipt (#F5C518).
export const HOTEL_RECEIPT_GOLD = "#F5C518";

export const hotelReceiptTheme = {
  ...professionalTheme,
  colors: {
    ...professionalTheme.colors,
    accent: HOTEL_RECEIPT_GOLD,
  },
  name: "hotel-receipt",
};

const formatAmount = (num) =>
  `PHP ${Number(num ?? 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const toDateStr = (value) => {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
};

const pluralizeNight = (n) => `${n} night${Number(n) === 1 ? "" : "s"}`;

/**
 * Normalizes the folio shape produced for `generateReceipt`
 * (see src/services/receiptService.js) into the data shape
 * `HotelReceiptDocument` renders.
 */
export const hotelReceiptDataFromFolio = (folio = {}) => {
  const total = Number(folio.total ?? folio.subtotal ?? 0);
  const extraPaxTotal = Number(folio.extraPaxTotal ?? 0);
  const overstayFee = Number(folio.overstayFee ?? 0);
  const baseTotal =
    Number(folio.baseTotal ?? total - extraPaxTotal - overstayFee);
  const amountPaid = Number(folio.amountPaid ?? 0);
  const refParts = [
    folio.gatewayRef ? `System ref ${folio.gatewayRef}` : null,
    folio.bankRef ? `Bank ref ${folio.bankRef}` : null,
    folio.reference || folio.paymentRef || null,
  ].filter(Boolean);

  return {
    receiptNo: folio.receiptNo || "RCP-" + Date.now(),
    paymentDateStr: toDateStr(folio.paymentDate),
    guestName: folio.guestName || "Guest",
    guestEmail: folio.guestEmail || "",
    processedBy: folio.processedBy || "Front Office Staff",
    roomLabel: folio.roomType
      ? `${folio.roomName || "Room"} (${folio.roomType})`
      : `${folio.roomName || "Room"}`,
    checkInStr: `${toDateStr(folio.checkIn)} · 2:00 PM`,
    checkOutStr: `${toDateStr(folio.checkOut)} · 12:00 NN`,
    nightsLabel: pluralizeNight(folio.numberOfNights ?? 0),
    rateStr: formatAmount(folio.ratePerNight),
    numberOfNights: Number(folio.numberOfNights ?? 0),
    baseTotalStr: formatAmount(baseTotal),
    hasExtraPax: extraPaxTotal > 0,
    extraPaxLine: `Extra guests (${folio.extraPaxCount ?? 0} × ${formatAmount(folio.extraPaxFee)}/night)`,
    extraPaxTotalStr: formatAmount(extraPaxTotal),
    hasOverstay: overstayFee > 0,
    overstayLabel: folio.overstayReason || "Late checkout fee",
    overstayStr: formatAmount(overstayFee),
    totalStr: formatAmount(total),
    paidStr: formatAmount(amountPaid),
    balanceStr: formatAmount(folio.balance ?? Math.max(0, total - amountPaid)),
    paymentMethod: `${folio.paymentMethod || "N/A"}${folio.simulated ? " (demo)" : ""}`,
    refLine: refParts.join("  ·  "),
    simulated: Boolean(folio.simulated),
  };
};

const HotelReceiptContent = ({ data }) => {
  const theme = usePdfcnTheme();

  const styles = StyleSheet.create({
    page: {
      backgroundColor: theme.colors.background,
      boxSizing: "border-box",
      minHeight: 841,
      padding: theme.spacing.page.marginTop,
      paddingBottom: theme.spacing.page.marginBottom,
      position: "relative",
    },
    pill: {
      alignSelf: "flex-start",
      backgroundColor: HOTEL_RECEIPT_GOLD,
      borderRadius: theme.primitives.borderRadius.sm,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
  });

  return (
    <Document title={`Receipt ${data.receiptNo}`}>
      <Page size="A4" style={styles.page}>
        <Section
          noWrap
          style={{
            alignItems: "flex-start",
            flexDirection: "row",
            marginBottom: theme.spacing.sectionGap,
          }}
        >
          <View style={{ flex: 1 }}>
            <PageHeader
              variant="minimal"
              title="HotelEase"
              subtitle="BSHM Property Management System"
              marginBottom={0}
            />
          </View>
          <View style={styles.pill}>
            <Text
              style={{
                color: "#1B1B1B",
                fontSize: 7,
                fontWeight: "bold",
                textAlign: "right",
              }}
              noMargin
              transform="uppercase"
            >
              Checked out
            </Text>
            <Text
              style={{
                color: "#1B1B1B",
                fontSize: 8,
                fontWeight: "bold",
                textAlign: "right",
              }}
              noMargin
            >
              {data.receiptNo}
            </Text>
          </View>
        </Section>

        <Text variant="xl" weight="bold" noMargin>
          {`Thank you for staying with us, ${data.guestName}!`}
        </Text>
        <Text variant="xs" color="mutedForeground">
          {`Receipt No ${data.receiptNo}  •  ${data.paymentDateStr}  •  Processed by ${data.processedBy}`}
        </Text>

        <Section spacing="sm">
          <Text variant="sm" weight="bold" noMargin>
            Stay
          </Text>
          <KeyValue
            size="sm"
            items={[
              { key: "Room", value: data.roomLabel },
              { key: "Check-in", value: data.checkInStr },
              { key: "Check-out", value: data.checkOutStr },
              { key: "Nights", value: data.nightsLabel },
              { key: "Rate", value: data.rateStr },
              ...(data.hasExtraPax
                ? [{ key: "Extra guests", value: data.extraPaxTotalStr }]
                : []),
            ]}
          />
        </Section>

        <Table variant="compact">
          <TableHeader>
            <TableRow header>
              <TableCell>Charges</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>{`Room charges × ${data.numberOfNights}`}</TableCell>
              <TableCell align="right">{data.baseTotalStr}</TableCell>
            </TableRow>
            {data.hasExtraPax ? (
              <TableRow>
                <TableCell>{data.extraPaxLine}</TableCell>
                <TableCell align="right">{data.extraPaxTotalStr}</TableCell>
              </TableRow>
            ) : null}
            {data.hasOverstay ? (
              <TableRow>
                <TableCell>{data.overstayLabel}</TableCell>
                <TableCell align="right">{data.overstayStr}</TableCell>
              </TableRow>
            ) : null}
            <TableRow>
              <TableCell>
                <Text weight="bold" noMargin>
                  Total
                </Text>
              </TableCell>
              <TableCell align="right">
                <Text weight="bold" noMargin>
                  {data.totalStr}
                </Text>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Paid</TableCell>
              <TableCell align="right">{data.paidStr}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>
                <Text weight="bold" noMargin>
                  Balance
                </Text>
              </TableCell>
              <TableCell align="right">
                <Text weight="bold" noMargin>
                  {data.balanceStr}
                </Text>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <Section spacing="sm">
          <Text variant="sm" weight="bold" noMargin>
            Payment
          </Text>
          <Text variant="sm" noMargin>
            {data.paymentMethod}
          </Text>
          {data.refLine ? (
            <Text variant="xs" color="mutedForeground" noMargin>
              {data.refLine}
            </Text>
          ) : null}
          {data.guestEmail ? (
            <Text variant="xs" color="mutedForeground" noMargin>
              {data.guestEmail}
            </Text>
          ) : null}
          {data.simulated ? (
            <Text variant="xs" color="mutedForeground" noMargin>
              Demo payment. No real money moved.
            </Text>
          ) : null}
        </Section>

        <PageFooter
          variant="centered"
          leftText="We hope to see you again."
          rightText="Your feedback matters to us."
          sticky
          pagePadding={25}
        />
      </Page>
    </Document>
  );
};

export const HotelReceiptDocument = ({ data, theme }) => (
  <PdfcnThemeProvider theme={theme ?? hotelReceiptTheme}>
    <HotelReceiptContent data={data} />
  </PdfcnThemeProvider>
);

// DOM preview uses the same tree (pdf-primitives render div/span).
export const HotelReceiptPreview = HotelReceiptDocument;
