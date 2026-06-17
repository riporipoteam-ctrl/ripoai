import SwiftUI

// Friends + Messages — the native SwiftUI port of the web social feature.
// Talks to the SAME Firestore over REST (shared account/uid) so friends, requests
// and DMs match the web + Android. Liquid-Glass styled.

struct Friend: Identifiable, Equatable {
    let id: String       // uid
    var name: String
    var handle: String
}

struct DMItem: Identifiable {
    let id: String
    let from: String
    let text: String
    let ts: Double
}

enum FriendsService {
    private static func authedGET(_ url: URL, _ user: AuthUser) async -> [String: Any] {
        var req = URLRequest(url: url)
        req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        let data = (try? await URLSession.shared.data(for: req))?.0 ?? Data()
        return ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any]) ?? [:]
    }

    private static func s(_ any: Any?) -> String? { (any as? [String: Any])?["stringValue"] as? String }
    private static func i(_ any: Any?) -> Double? {
        if let v = (any as? [String: Any])?["integerValue"] as? String { return Double(v) }
        if let v = (any as? [String: Any])?["doubleValue"] as? Double { return v }
        return nil
    }

    private static func profile(from doc: [String: Any]) -> Friend? {
        guard let name = doc["name"] as? String,
              let fields = doc["fields"] as? [String: Any] else { return nil }
        let uid = name.split(separator: "/").last.map(String.init) ?? ""
        if let p = (fields["profile"] as? [String: Any])?["mapValue"] as? [String: Any],
           let pf = p["fields"] as? [String: Any] {
            return Friend(id: uid, name: s(pf["name"]) ?? "User", handle: s(pf["handle"]) ?? "")
        }
        // a friends/requests doc stores name/handle at the top level
        return Friend(id: uid, name: s(fields["name"]) ?? "User", handle: s(fields["handle"]) ?? "")
    }

    static func publishProfile(_ user: AuthUser, name: String) async {
        let handle = name.lowercased().filter { $0.isLetter || $0.isNumber || $0 == "." || $0 == "_" }
        let url = URL(string: "\(FB.docBase)/users/\(user.uid)?updateMask.fieldPaths=profile")!
        var req = URLRequest(url: url)
        req.httpMethod = "PATCH"
        req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = ["fields": ["profile": ["mapValue": ["fields": [
            "uid": ["stringValue": user.uid],
            "name": ["stringValue": name],
            "handle": ["stringValue": handle],
        ]]]]]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        _ = try? await URLSession.shared.data(for: req)
    }

    static func collection(_ path: String, _ user: AuthUser) async -> [Friend] {
        let obj = await authedGET(URL(string: "\(FB.docBase)/\(path)?pageSize=60")!, user)
        let docs = obj["documents"] as? [[String: Any]] ?? []
        return docs.compactMap { profile(from: $0) }
    }

    static func friends(_ user: AuthUser) async -> [Friend] { await collection("users/\(user.uid)/friends", user) }
    static func requests(_ user: AuthUser) async -> [Friend] { await collection("users/\(user.uid)/requests", user) }
    static func everyone(_ user: AuthUser) async -> [Friend] {
        (await collection("users", user)).filter { $0.id != user.uid && !$0.handle.isEmpty }
    }

    private static func putFriendDoc(_ path: String, _ f: Friend, _ user: AuthUser) async {
        let url = URL(string: "\(FB.docBase)/\(path)")!
        var req = URLRequest(url: url)
        req.httpMethod = "PATCH"
        req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["fields": [
            "name": ["stringValue": f.name], "handle": ["stringValue": f.handle],
            "uid": ["stringValue": f.id],
        ]])
        _ = try? await URLSession.shared.data(for: req)
    }

    static func sendRequest(_ user: AuthUser, me: Friend, to target: Friend) async {
        await putFriendDoc("users/\(target.id)/requests/\(user.uid)", me, user)
    }
    static func accept(_ user: AuthUser, me: Friend, from f: Friend) async {
        await putFriendDoc("users/\(user.uid)/friends/\(f.id)", f, user)
        await putFriendDoc("users/\(f.id)/friends/\(user.uid)", me, user)
        let url = URL(string: "\(FB.docBase)/users/\(user.uid)/requests/\(f.id)")!
        var req = URLRequest(url: url); req.httpMethod = "DELETE"
        req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        _ = try? await URLSession.shared.data(for: req)
    }

    static func cid(_ a: String, _ b: String) -> String { [a, b].sorted().joined(separator: "__") }

    static func messages(_ user: AuthUser, _ cid: String) async -> [DMItem] {
        let obj = await authedGET(URL(string: "\(FB.docBase)/dms/\(cid)/messages?pageSize=200")!, user)
        let docs = obj["documents"] as? [[String: Any]] ?? []
        let items: [DMItem] = docs.compactMap { d in
            guard let name = d["name"] as? String, let f = d["fields"] as? [String: Any] else { return nil }
            let id = name.split(separator: "/").last.map(String.init) ?? UUID().uuidString
            return DMItem(id: id, from: s(f["from"]) ?? "", text: s(f["text"]) ?? "", ts: i(f["ts"]) ?? 0)
        }
        return items.sorted { $0.ts < $1.ts }
    }

    static func send(_ user: AuthUser, to otherUid: String, _ text: String) async {
        let c = cid(user.uid, otherUid)
        let now = Int(Date().timeIntervalSince1970 * 1000)
        // message (auto-id via POST to the collection)
        var req = URLRequest(url: URL(string: "\(FB.docBase)/dms/\(c)/messages")!)
        req.httpMethod = "POST"
        req.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["fields": [
            "from": ["stringValue": user.uid], "text": ["stringValue": text],
            "ts": ["integerValue": String(now)],
        ]])
        _ = try? await URLSession.shared.data(for: req)
        // conversation meta
        var meta = URLRequest(url: URL(string: "\(FB.docBase)/dms/\(c)")!)
        meta.httpMethod = "PATCH"
        meta.setValue("Bearer \(user.idToken)", forHTTPHeaderField: "Authorization")
        meta.setValue("application/json", forHTTPHeaderField: "Content-Type")
        meta.httpBody = try? JSONSerialization.data(withJSONObject: ["fields": [
            "participants": ["arrayValue": ["values": [["stringValue": user.uid], ["stringValue": otherUid]]]],
            "last": ["stringValue": text], "lastFrom": ["stringValue": user.uid],
            "ts": ["integerValue": String(now)],
        ]])
        _ = try? await URLSession.shared.data(for: meta)
    }
}

struct FriendsScreen: View {
    @EnvironmentObject var store: AppStore
    let back: () -> Void

    @State private var tab = 0  // 0 friends, 1 messages
    @State private var friends: [Friend] = []
    @State private var requests: [Friend] = []
    @State private var suggestions: [Friend] = []
    @State private var search = ""
    @State private var sent: Set<String> = []
    @State private var openChat: Friend?

    private var me: Friend {
        let name = store.user?.email.split(separator: "@").first.map(String.init) ?? "You"
        return Friend(id: store.user?.uid ?? "", name: name, handle: name.lowercased())
    }

    private var results: [Friend] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return [] }
        return suggestions.filter { $0.name.lowercased().contains(q) || $0.handle.contains(q) }
    }

    var body: some View {
        ZStack {
            GlassBackground()
            if let chat = openChat {
                DMThread(other: chat) { openChat = nil }
            } else {
                VStack(spacing: 0) {
                    HStack {
                        Button { back() } label: { Image(systemName: "chevron.left").font(.system(size: 17, weight: .semibold)) }
                            .buttonStyle(.plain).foregroundStyle(.primary)
                        Text(store.t("Friends")).font(.system(size: 22, weight: .bold))
                        Spacer()
                    }.padding(.horizontal, 18).padding(.top, 16).padding(.bottom, 10)

                    Picker("", selection: $tab) {
                        Text(store.t("Friends")).tag(0); Text(store.t("Messages")).tag(1)
                    }.pickerStyle(.segmented).padding(.horizontal, 16).padding(.bottom, 8)

                    ScrollView {
                        VStack(spacing: 8) {
                            if tab == 0 {
                                HStack(spacing: 8) {
                                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                                    TextField(store.t("Search people by username"), text: $search).textInputAutocapitalization(.never)
                                }.padding(.horizontal, 14).padding(.vertical, 11).liquidGlass(cornerRadius: 16)

                                if !results.isEmpty { section(store.t("Results"), results) { addBtn($0) } }
                                if !requests.isEmpty {
                                    section("\(store.t("Requests")) · \(requests.count)", requests) { f in
                                        HStack(spacing: 6) {
                                            Button { Task { await FriendsService.accept(store.user!, me: me, from: f); await load() } } label: {
                                                Image(systemName: "checkmark").frame(width: 32, height: 32).liquidGlass(cornerRadius: 16)
                                            }.buttonStyle(.plain)
                                        }
                                    }
                                }
                                if search.isEmpty && !suggestions.isEmpty {
                                    section(store.t("Suggestions"), Array(suggestions.prefix(8))) { addBtn($0) }
                                }
                                section("\(store.t("Your friends")) · \(friends.count)", friends) { f in
                                    Button { openChat = f } label: {
                                        Image(systemName: "message").frame(width: 32, height: 32).liquidGlass(cornerRadius: 16)
                                    }.buttonStyle(.plain).foregroundStyle(.primary)
                                }
                                if friends.isEmpty { Text(store.t("No friends yet — search above to add some.")).font(.caption).foregroundStyle(.secondary).padding(.top, 10) }
                            } else {
                                if friends.isEmpty {
                                    Text(store.t("Add friends to start chatting, voice & video calling.")).font(.callout).foregroundStyle(.secondary).padding(.top, 24)
                                }
                                ForEach(friends) { f in
                                    Button { openChat = f } label: {
                                        HStack {
                                            avatar(f)
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(f.name).font(.system(size: 15, weight: .semibold))
                                                Text("@\(f.handle)").font(.system(size: 12)).foregroundStyle(.secondary)
                                            }
                                            Spacer()
                                            Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(.secondary)
                                        }.padding(.horizontal, 14).padding(.vertical, 12).frame(maxWidth: .infinity, alignment: .leading).liquidGlass(cornerRadius: 18)
                                    }.buttonStyle(PressableButtonStyle()).foregroundStyle(.primary)
                                }
                            }
                        }.padding(.horizontal, 16).padding(.bottom, 30)
                    }
                }
            }
        }
        .task { await load() }
    }

    private func addBtn(_ f: Friend) -> some View {
        Button {
            Task { await FriendsService.sendRequest(store.user!, me: me, to: f); sent.insert(f.id) }
        } label: {
            Text(sent.contains(f.id) ? store.t("Sent") : store.t("Add"))
                .font(.system(size: 12, weight: .bold)).padding(.horizontal, 12).padding(.vertical, 7).liquidGlass(cornerRadius: 14)
        }.buttonStyle(.plain).foregroundStyle(.primary).disabled(sent.contains(f.id))
    }

    private func avatar(_ f: Friend) -> some View {
        Text(String(f.name.prefix(1)).uppercased())
            .font(.system(size: 16, weight: .bold))
            .frame(width: 40, height: 40)
            .background(Color.accentColor.opacity(0.18), in: Circle())
    }

    @ViewBuilder private func section<Trailing: View>(_ title: String, _ items: [Friend], @ViewBuilder trailing: @escaping (Friend) -> Trailing) -> some View {
        HStack { Text(title).font(.system(size: 12, weight: .bold)).foregroundStyle(.secondary); Spacer() }.padding(.horizontal, 4).padding(.top, 8)
        ForEach(items) { f in
            HStack {
                avatar(f)
                VStack(alignment: .leading, spacing: 2) {
                    Text(f.name).font(.system(size: 15, weight: .semibold))
                    Text("@\(f.handle)").font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer()
                trailing(f)
            }.padding(.horizontal, 14).padding(.vertical, 10).frame(maxWidth: .infinity, alignment: .leading).liquidGlass(cornerRadius: 18)
        }
    }

    private func load() async {
        guard let user = store.user else { return }
        await FriendsService.publishProfile(user, name: me.name)
        async let f = FriendsService.friends(user)
        async let r = FriendsService.requests(user)
        async let e = FriendsService.everyone(user)
        friends = await f; requests = await r
        let fr = Set(friends.map { $0.id })
        suggestions = (await e).filter { !fr.contains($0.id) }
    }
}

struct DMThread: View {
    @EnvironmentObject var store: AppStore
    let other: Friend
    let back: () -> Void
    @State private var msgs: [DMItem] = []
    @State private var draft = ""
    @State private var timer: Timer?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button { back() } label: { Image(systemName: "chevron.left").font(.system(size: 17, weight: .semibold)) }.buttonStyle(.plain).foregroundStyle(.primary)
                Text(other.name).font(.system(size: 17, weight: .bold))
                Spacer()
                Button { NotificationCenter.default.post(name: .askaiStartCall, object: nil, userInfo: ["uid": other.id, "name": other.name, "kind": "audio"]) } label: { Image(systemName: "phone").foregroundStyle(.primary) }.buttonStyle(.plain)
                Button { NotificationCenter.default.post(name: .askaiStartCall, object: nil, userInfo: ["uid": other.id, "name": other.name, "kind": "video"]) } label: { Image(systemName: "video").foregroundStyle(.primary) }.buttonStyle(.plain)
            }.padding(.horizontal, 16).padding(.vertical, 12)

            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(msgs) { m in
                            let mine = m.from == store.user?.uid
                            HStack {
                                if mine { Spacer() }
                                Text(m.text)
                                    .padding(.horizontal, 12).padding(.vertical, 8)
                                    .background(mine ? Color.accentColor.opacity(0.9) : Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                    .foregroundStyle(mine ? Color.white : Color.primary)
                                    .frame(maxWidth: 280, alignment: mine ? .trailing : .leading)
                                if !mine { Spacer() }
                            }.id(m.id)
                        }
                    }.padding(16)
                }
                .onChange(of: msgs.count) { _ in if let last = msgs.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } } }
            }

            HStack(spacing: 8) {
                TextField(store.t("Message…"), text: $draft, axis: .vertical).padding(.horizontal, 14).padding(.vertical, 10).liquidGlass(cornerRadius: 20)
                Button { send() } label: { Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold)).frame(width: 40, height: 40).background(Color.accentColor, in: Circle()).foregroundStyle(.white) }.buttonStyle(.plain)
            }.padding(.horizontal, 12).padding(.bottom, 8)
        }
        .task { await reload(); startPolling() }
        .onDisappear { timer?.invalidate() }
    }

    private func send() {
        let t = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty, let user = store.user else { return }
        draft = ""
        Task { await FriendsService.send(user, to: other.id, t); await reload() }
    }
    private func reload() async {
        guard let user = store.user else { return }
        msgs = await FriendsService.messages(user, FriendsService.cid(user.uid, other.id))
    }
    private func startPolling() {
        timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { _ in Task { await reload() } }
    }
}
