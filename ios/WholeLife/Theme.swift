import SwiftUI

// Colors follow the web app's tokens (docs/CONTEXT.md): flat cards, one accent,
// category colors only on icons, labels and chart bars.
enum Theme {
    static let canvas = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor.black : UIColor(red: 0.949, green: 0.949, blue: 0.969, alpha: 1) })
    static let card = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.110, green: 0.110, blue: 0.118, alpha: 1) : UIColor.white })
    static let gray = Color(UIColor.secondaryLabel)

    static let food = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.188, green: 0.820, blue: 0.345, alpha: 1) : UIColor(red: 0.118, green: 0.482, blue: 0.216, alpha: 1) })
    static let activity = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 1.0, green: 0.412, blue: 0.216, alpha: 1) : UIColor(red: 0.757, green: 0.267, blue: 0.055, alpha: 1) })
    static let sleep = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.490, green: 0.478, blue: 1.0, alpha: 1) : UIColor(red: 0.290, green: 0.282, blue: 0.769, alpha: 1) })
    static let water = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.188, green: 0.690, blue: 0.780, alpha: 1) : UIColor(red: 0.055, green: 0.478, blue: 0.549, alpha: 1) })
    static let heart = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 1.0, green: 0.176, blue: 0.333, alpha: 1) : UIColor(red: 0.839, green: 0.067, blue: 0.294, alpha: 1) })
    static let coach = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.392, green: 0.824, blue: 1.0, alpha: 1) : UIColor(red: 0, green: 0.467, blue: 0.651, alpha: 1) })
    static let gold = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 1.0, green: 0.839, blue: 0.039, alpha: 1) : UIColor(red: 0.541, green: 0.380, blue: 0, alpha: 1) })
}

// Flat card: solid, 20pt radius, 16pt padding, no shadow or border.
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

// Page wrapper: scrolling column on the canvas color.
struct Page<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(spacing: 12) { content }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
        }
        .background(Theme.canvas.ignoresSafeArea())
        .navigationTitle(title)
    }
}

struct SectionTitle: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text)
            .font(.title2.bold())
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 8)
    }
}

// Summary-style dashboard card: category header, big value bottom left, optional bars.
struct MetricCard: View {
    let icon: String
    let name: String
    let color: Color
    let value: String
    let unit: String
    var note: String? = nil
    var bars: [Double] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Image(systemName: icon).font(.system(size: 18, weight: .semibold))
                Text(name).font(.system(size: 17, weight: .semibold))
                Spacer()
                Text("Today").font(.system(size: 15)).foregroundStyle(Theme.gray)
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.gray)
            }
            .foregroundStyle(color)
            Spacer(minLength: 48)
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(value).font(.system(size: 34, weight: .bold)).monospacedDigit()
                        Text(unit).font(.system(size: 17)).foregroundStyle(Theme.gray)
                    }
                    if let note { Text(note).font(.system(size: 15)).foregroundStyle(Theme.gray) }
                }
                Spacer()
                if !bars.isEmpty { MiniBars(values: bars, color: color) }
            }
        }
        .card()
    }
}

// Gray bars with the latest one in the category color, at most 120x64.
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

// Gradient icon tile like the sidebar tiles (30pt, two-tone).
struct IconTile: View {
    let symbol: String
    let color: Color

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 30, height: 30)
            .background(
                LinearGradient(colors: [color.opacity(0.75), color], startPoint: .topLeading, endPoint: .bottomTrailing)
            )
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}
