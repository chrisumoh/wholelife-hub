import SwiftUI

struct SnacksView: View {
    @EnvironmentObject var store: AppStore
    @State private var region = "west"
    @State private var query = ""
    @State private var justLogged: String?

    private var results: [SnackItem] {
        Catalog.shared.snacks.filter { s in
            (region == "all" || s.r == region)
                && (query.isEmpty || s.n.localizedCaseInsensitiveContains(query))
        }
    }

    var body: some View {
        Page(title: "Snack log") {
            let today = store.snacks(on: store.today)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    CategoryLabel(symbol: "carrot.fill", name: "Snacks today", color: Theme.activity)
                    Spacer()
                }
                BigNumber(value: today.map { $0.cal }.reduce(0, +).formatted(), unit: "cal")
                ForEach(today) { s in
                    Divider()
                    HStack {
                        Text(s.name)
                        Spacer()
                        Text("\(s.cal) cal").foregroundStyle(Theme.gray).monospacedDigit()
                        Button { store.deleteSnack(s) } label: {
                            Image(systemName: "trash").foregroundStyle(Theme.bad).frame(width: 36, height: 36)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Remove \(s.name)")
                    }
                }
            }
            .card()

            Picker("Region", selection: $region) {
                Text("West Africa").tag("west")
                Text("All regions").tag("all")
                ForEach(Tables.regions.filter { $0.id != "west" }) { r in Text(r.name).tag(r.id) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()

            HStack {
                Image(systemName: "magnifyingglass").foregroundStyle(Theme.gray)
                TextField("Search snacks", text: $query)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(spacing: 0) {
                ForEach(Array(results.enumerated()), id: \.element.id) { i, s in
                    HStack(alignment: .center, spacing: 12) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(s.n).font(.system(size: 17, weight: .semibold))
                            Text("\(s.sv) · \(s.cal) cal").font(.subheadline).foregroundStyle(Theme.gray)
                        }
                        Spacer()
                        Button(justLogged == s.id ? "Logged" : "Log") {
                            store.logSnack(name: s.n, cal: s.cal)
                            justLogged = s.id
                        }
                        .buttonStyle(SoftButtonStyle())
                    }
                    .padding(.vertical, 8)
                    if i < results.count - 1 { Divider() }
                }
                if results.isEmpty { EmptyNote(text: "No snacks match.") }
            }
            .card()
        }
    }
}
