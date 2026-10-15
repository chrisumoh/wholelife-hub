import Foundation

// Loads Resources/catalog.json once. West African dishes are sorted first (CLAUDE.md section 3).
final class Catalog {
    static let shared = Catalog()

    let dishes: [Dish]
    let snacks: [SnackItem]
    let premium: [PremiumFeature]
    let about: [String: String]
    let ex: [String: [String: [ExerciseLine]]]

    private init() {
        var file: CatalogFile?
        let url = Bundle.main.url(forResource: "catalog", withExtension: "json")
            ?? Bundle.main.url(forResource: "catalog", withExtension: "json", subdirectory: "Resources")
        if let url, let data = try? Data(contentsOf: url) {
            file = try? JSONDecoder().decode(CatalogFile.self, from: data)
        }
        let all = file?.dishes ?? []
        dishes = all.filter { $0.r == "west" } + all.filter { $0.r != "west" }
        let sn = file?.snacks ?? []
        snacks = sn.filter { $0.r == "west" } + sn.filter { $0.r != "west" }
        premium = file?.premium ?? []
        about = file?.about ?? [:]
        ex = file?.ex ?? [:]
    }

    func dish(_ id: String) -> Dish? { dishes.first { $0.id == id } }
}
