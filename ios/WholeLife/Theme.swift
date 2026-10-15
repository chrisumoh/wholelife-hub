import SwiftUI

private func dyn(_ light: UInt32, _ dark: UInt32) -> Color {
    Color(UIColor { trait in
        let v = trait.userInterfaceStyle == .dark ? dark : light
        return UIColor(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    })
}

// Tokens come from the web app (docs/CONTEXT.md): flat solid cards, 20pt radius, hairline
// separators, category colors only on icons, labels and chart marks.
enum Theme {
    static let canvas = dyn(0xF2F2F7, 0x000000)
    static let card = dyn(0xFFFFFF, 0x1C1C1E)
    static let field = dyn(0xF2F2F7, 0x2C2C2E)
    static let gray = Color(UIColor.secondaryLabel)

    static let food = dyn(0x1E7B37, 0x30D158)
    static let activity = dyn(0xC1440E, 0xFF6937)
    static let sleep = dyn(0x4A48C4, 0x7D7AFF)
    static let water = dyn(0x0E7A8C, 0x30B0C7)
    static let heart = dyn(0xD6114B, 0xFF2D55)
    static let coach = dyn(0x0077A6, 0x64D2FF)
    static let gold = dyn(0x8A6100, 0xFFD60A)
    static let good = dyn(0x167548, 0x34C77B)
    static let bad = dyn(0xB1342E, 0xFF6961)

    // Sidebar icon tiles: two-tone 135 degree gradients (--si-*-a / --si-*-b).
    static func tile(_ a: UInt32, _ b: UInt32) -> LinearGradient {
        func c(_ v: UInt32) -> Color {
            Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
        }
        return LinearGradient(colors: [c(a), c(b)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    static let summaryTile = tile(0xFF5E7E, 0xFF2D55)
    static let healthTile = tile(0x4DA3FF, 0x5E5CE6)
    static let mealsTile = tile(0x5BDB7F, 0x22A653)
    static let snacksTile = tile(0xFFB45E, 0xE0762C)
    static let workoutsTile = tile(0xFF8A4C, 0xF0532B)
    static let recipesTile = tile(0xA6E05B, 0x4CAF50)
    static let cultureTile = tile(0x34D1C0, 0x1AA6C4)
    static let coachTile = tile(0x8E7BFF, 0x4F6BFF)
    static let awardsTile = tile(0xFFD60A, 0xF5A100)
    static let settingsTile = tile(0x9A9AA2, 0x6B6B73)
    static let logTile = tile(0x34D399, 0x0D9488)
    static let shareTile = tile(0xB48CFF, 0xEC4899)
}

// ---- cards and layout ----

struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

extension View {
    func card() -> some View { modifier(CardStyle()) }
}

struct Page<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(spacing: 12) { content }
                .padding(.horizontal, 16)
                .padding(.bottom, 28)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.canvas.ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.large)
    }
}

struct SectionTitle: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.title2.bold())
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 10)
    }
}

struct Eyebrow: View {
    let text: String
    var color: Color = Theme.gray
    init(_ text: String, color: Color = Theme.gray) { self.text = text; self.color = color }

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 12, weight: .semibold))
            .tracking(0.6)
            .foregroundStyle(color)
    }
}

struct BigNumber: View {
    let value: String
    var unit: String = ""
    var size: CGFloat = 34

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(value).font(.system(size: size, weight: .bold)).monospacedDigit()
            if !unit.isEmpty { Text(unit).font(.system(size: 17)).foregroundStyle(Theme.gray) }
        }
    }
}

struct Tag: View {
    let text: String
    var color: Color = Theme.good

    var body: some View {
        Text(text)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.15))
            .clipShape(Capsule())
    }
}

// A row inside a card: label left, value right, hairline under it.
struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Text(value).foregroundStyle(Theme.gray).monospacedDigit()
        }
        .padding(.vertical, 8)
    }
}

// 30pt gradient tile with a white glyph, the sidebar icon component.
struct IconTile: View {
    let symbol: String
    let fill: LinearGradient
    var size: CGFloat = 30

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.5, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(fill)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.27, style: .continuous))
    }
}

// Category icon plus name in the category color (card header).
struct CategoryLabel: View {
    let symbol: String
    let name: String
    let color: Color

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: symbol).font(.system(size: 17, weight: .semibold))
            Text(name).font(.system(size: 17, weight: .semibold))
        }
        .foregroundStyle(color)
    }
}

// Summary-style dashboard card: header, big value bottom left, optional bars bottom right.
struct MetricCard: View {
    let symbol: String
    let name: String
    let color: Color
    let value: String
    var unit: String = ""
    var note: String? = nil
    var bars: [Double] = []
    var stamp: String = "Today"

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                CategoryLabel(symbol: symbol, name: name, color: color)
                Spacer()
                Text(stamp).font(.system(size: 15)).foregroundStyle(Theme.gray)
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.gray)
            }
            Spacer(minLength: 44)
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    BigNumber(value: value, unit: unit)
                    if let note { Text(note).font(.system(size: 15)).foregroundStyle(Theme.gray) }
                }
                Spacer()
                if !bars.isEmpty { MiniBars(values: bars, color: color) }
            }
        }
        .card()
    }
}

struct MiniBars: View {
    let values: [Double]
    let color: Color

    var body: some View {
        let top = max(values.max() ?? 1, 1)
        HStack(alignment: .bottom, spacing: 4) {
            ForEach(Array(values.enumerated()), id: \.offset) { i, v in
                RoundedRectangle(cornerRadius: 3)
                    .fill(i == values.count - 1 ? color : Theme.gray.opacity(0.35))
                    .frame(width: 12, height: max(4, 64 * v / top))
            }
        }
        .frame(width: 120, height: 64, alignment: .bottomTrailing)
    }
}

struct ProgressBar: View {
    let fraction: Double
    let color: Color

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.gray.opacity(0.2))
                Capsule().fill(color).frame(width: geo.size.width * min(max(fraction, 0), 1))
            }
        }
        .frame(height: 8)
    }
}

// Three concentric arcs, like the web's rings dial. Outer ring first.
struct RingsDial: View {
    let rings: [AppStore.Ring]
    var size: CGFloat = 150

    var body: some View {
        ZStack {
            ForEach(Array(rings.enumerated()), id: \.element.id) { i, r in
                let inset = CGFloat(i) * 20
                Circle()
                    .stroke(r.color.opacity(0.18), lineWidth: 14)
                    .padding(inset)
                Circle()
                    .trim(from: 0, to: max(r.fraction, 0.001))
                    .stroke(r.color, style: StrokeStyle(lineWidth: 14, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .padding(inset)
            }
        }
        .padding(7)
        .frame(width: size, height: size)
    }
}

// A tappable row with a tile, used in lists inside cards.
struct ChevronRow: View {
    let title: String
    var subtitle: String? = nil

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).foregroundStyle(.primary)
                if let subtitle { Text(subtitle).font(.subheadline).foregroundStyle(Theme.gray) }
            }
            Spacer()
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.gray)
        }
    }
}

struct EmptyNote: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(Theme.gray)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 4)
    }
}

// Filled button in the app accent, 44pt tall like the web controls.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(.tint)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

struct SoftButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.tint)
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(Theme.field)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

struct Field: View {
    let title: String
    @Binding var text: String
    var placeholder: String = ""
    var numeric = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.gray)
            TextField(placeholder, text: $text)
                .keyboardType(numeric ? .decimalPad : .default)
                .padding(.horizontal, 12)
                .frame(minHeight: 44)
                .background(Theme.field)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }
}
