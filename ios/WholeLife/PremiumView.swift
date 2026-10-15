import SwiftUI

struct PremiumView: View {
    private let phases = [1, 2, 3, 4, 5]

    var body: some View {
        Page(title: "Premium") {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: "crown.fill")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(Theme.awardsTile)
                    .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                Text("Whole Life Premium").font(.title2.bold())
                Text("Premium is free while the app is in beta. These are the features it adds on the website; the iOS preview shows the list only.")
                    .font(.subheadline).foregroundStyle(Theme.gray)
            }
            .card()

            ForEach(phases, id: \.self) { phase in
                let items = Catalog.shared.premium.filter { $0.phase == phase }
                if !items.isEmpty {
                    SectionTitle("Phase \(phase)")
                    VStack(spacing: 0) {
                        ForEach(Array(items.enumerated()), id: \.element.id) { i, f in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(f.name).font(.system(size: 17, weight: .semibold))
                                Text(f.blurb).font(.subheadline).foregroundStyle(Theme.gray)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 10)
                            if i < items.count - 1 { Divider() }
                        }
                    }
                    .card()
                }
            }
        }
    }
}
