import { styles as GRaw } from "@/styles/stylesIndex";
const G = GRaw as any;
import { AppHeader } from "@/components/AppHeader";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { appService } from "@/UtilServices/appHelper";
import { useUserContext } from "@/context/AuthContext";

// ── Types ──────────────────────────────────────────────
interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  isActive: boolean;
}

interface Msg91Config {
  authkey: string;
  sender_id: string;
  template_id: string;
  whatsapp_template_id: string;
  isActive: boolean;
}

interface FormState {
  IndiaMart: string;
  TradeIndia: string;
  JustDial: string;
  msg91: Msg91Config;
  mailConfigure: MailConfig;
}

// ── Constants ──────────────────────────────────────────
const FIELDS: { key: keyof Omit<FormState, "mailConfigure" | "msg91">; label: string; icon: string; placeholder: string }[] = [
  { key: "IndiaMart",  label: "IndiaMart API URL",  icon: "🏪", placeholder: "https://api.indiamart.com/..." },
  { key: "TradeIndia", label: "TradeIndia API URL", icon: "📦", placeholder: "https://api.tradeindia.com/..." },
  { key: "JustDial",   label: "JustDial API URL",   icon: "📞", placeholder: "https://api.justdial.com/..." },
];

const INITIAL_FORM: FormState = {
  IndiaMart: "",
  TradeIndia: "",
  JustDial: "",
  msg91: {
    authkey: "",
    sender_id: "",
    template_id: "",
    whatsapp_template_id: "",
    isActive: false,
  },
  mailConfigure: {
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: "", pass: "" },
    isActive: false,
  },
};

// ── Component ──────────────────────────────────────────
export default function ApiUrlsConfig() {
  const router = useRouter();
  const { user } = useUserContext();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"api" | "mail" | "db">("api");

  const handleField = (key: keyof Omit<FormState, "mailConfigure">, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleMsg91 = (path: keyof Msg91Config, value: string | boolean) => {
    setForm((prev) => ({
      ...prev,
      msg91: { ...prev.msg91, [path]: value },
    }));
  };

  const handleMail = (path: string, value: string | number | boolean) => {
    setForm((prev) => ({
      ...prev,
      mailConfigure: {
        ...prev.mailConfigure,
        ...(path === "user" || path === "pass"
          ? { auth: { ...prev.mailConfigure.auth, [path]: value } }
          : { [path]: value }),
      },
    }));
  };

  const handleSave = async () => {
    if (!user?.userId) return appService.showToast("Unauthorized", "Error");
    setSaving(true);
    try {
      const res = await appService.httpClient.put(`/api/auth/url-configure/${user.userId}`, { 
        apiUrls: form 
      });
      
      if (res.data?.success) {
        setSaved(true);
        appService.showToast("Configurations saved", "Success");
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (e: any) {
      appService.showToast(e.response?.data?.message || "Save failed", "Error");
    }
    setSaving(false);
  };

  const handleProvision = async () => {
    if (user?.userRole !== "CorpAdmin") return;
    setProvisioning(true);
    try {
      const res = await appService.httpClient.post("/auth/provision-tenant", { 
        corporateId: user?.corporateId 
      });
      if (res.data?.success) {
        appService.showToast("Database Infrastructure Provisioned", "Success");
      }
    } catch (e: any) {
      appService.showToast(e.response?.data?.message || "Provisioning failed", "Error");
    } finally {
      setProvisioning(false);
    }
  };

  return (
    <SafeAreaView style={G.configPage as any} edges={["top"]}>
      <AppHeader 
        title="API Integration" 
        onBackPress={() => router.back()} 
        rightAction={() => (
          <TouchableOpacity
            style={[G.configSaveBtn, saved && G.configSaveBtnSuccess, { paddingHorizontal: 16 }] as any}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={G.configSaveBtnText as any}>
              {saving ? "..." : saved ? "✓" : "Save"}
            </Text>
          </TouchableOpacity>
        )}
      />
      <ScrollView contentContainerStyle={G.configScroll as any}>

      {/* ── Tabs ── */}
      <View style={G.configTabs as any}>
        {(["api", "mail", "db"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[G.configTab, activeTab === tab && G.configTabActive] as any}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[G.configTabText, activeTab === tab && G.configTabTextActive] as any}>
              {tab === "api" ? "🔗 API URLs" : tab === "mail" ? "📧 Mail" : "🗄️ Database"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── API URLs Tab ── */}
      {activeTab === "api" && (
        <View style={G.configGrid as any}>
          {/* MSG91 Section */}
          <View style={[G.configCard, { width: '100%', borderColor: 'rgba(0,229,255,0.3)' }] as any}>
            <View style={G.configToggleRow as any}>
               <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 20 }}>📲</Text>
                  <View>
                    <Text style={G.configCardLabel as any}>MSG91 Integration</Text>
                    <Text style={G.configToggleSub as any}>For SMS & WhatsApp OTP/Alerts</Text>
                  </View>
               </View>
               <Switch
                 value={form.msg91.isActive}
                 onValueChange={(v) => handleMsg91("isActive", v)}
                 trackColor={{ false: "#1e2a3a", true: "rgba(0,229,255,0.4)" }}
                 thumbColor={form.msg91.isActive ? "#00e5ff" : "#4a6a7a"}
               />
            </View>

            {form.msg91.isActive && (
              <View style={{ marginTop: 12, gap: 12 }}>
                <View style={G.configInputWrap as any}>
                  <Text style={{ color: '#5a7a8a', fontSize: 10, marginBottom: 4 }}>Auth Key</Text>
                  <TextInput
                    value={form.msg91.authkey}
                    onChangeText={(v) => handleMsg91("authkey", v)}
                    placeholder="Enter MSG91 AuthKey"
                    placeholderTextColor="#3a4a5a"
                    style={G.configInput as any}
                    autoCapitalize="none"
                  />
                </View>
                <View style={G.configInputWrap as any}>
                  <Text style={{ color: '#5a7a8a', fontSize: 10, marginBottom: 4 }}>Sender ID / Number</Text>
                  <TextInput
                    value={form.msg91.sender_id}
                    onChangeText={(v) => handleMsg91("sender_id", v)}
                    placeholder="e.g. PRTKBN"
                    placeholderTextColor="#3a4a5a"
                    style={G.configInput as any}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={[G.configInputWrap, { flex: 1 }] as any}>
                    <Text style={{ color: '#5a7a8a', fontSize: 10, marginBottom: 4 }}>SMS Template ID</Text>
                    <TextInput
                      value={form.msg91.template_id}
                      onChangeText={(v) => handleMsg91("template_id", v)}
                      placeholder="Template ID"
                      placeholderTextColor="#3a4a5a"
                      style={G.configInput as any}
                    />
                  </View>
                  <View style={[G.configInputWrap, { flex: 1 }] as any}>
                    <Text style={{ color: '#5a7a8a', fontSize: 10, marginBottom: 4 }}>WhatsApp Template ID</Text>
                    <TextInput
                      value={form.msg91.whatsapp_template_id}
                      onChangeText={(v) => handleMsg91("whatsapp_template_id", v)}
                      placeholder="Template ID"
                      placeholderTextColor="#3a4a5a"
                      style={G.configInput as any}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>

          {FIELDS.map(({ key, label, icon, placeholder }) => (
            <View key={key} style={G.configCard as any}>
              <View style={G.configCardHeader as any}>
                <Text style={G.configCardIcon as any}>{icon}</Text>
                <Text style={G.configCardLabel as any}>{label}</Text>
              </View>
              <View style={G.configInputWrap as any}>
                <TextInput
                  value={form[key] as string}
                  onChangeText={(v) => handleField(key as any, v)}
                  placeholder={placeholder}
                  placeholderTextColor="#3a4a5a"
                  style={G.configInput as any}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {(form[key] as string) !== "" && <View style={G.configDot as any} />}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── Mail Config Tab ── */}
      {activeTab === "mail" && (
        <View style={G.configMailSection as any}>
          <View style={G.configToggleRow as any}>
            <View>
              <Text style={G.configToggleLabel as any}>Mail Sync Active</Text>
              <Text style={G.configToggleSub as any}>Enable IMAP email fetching</Text>
            </View>
            <Switch
              value={form.mailConfigure.isActive}
              onValueChange={(v) => handleMail("isActive", v)}
              trackColor={{ false: "#1e2a3a", true: "rgba(0,229,255,0.4)" }}
              thumbColor={form.mailConfigure.isActive ? "#00e5ff" : "#4a6a7a"}
            />
          </View>

          <View style={G.configCard as any}>
            <Text style={G.configCardLabel as any}>IMAP Host</Text>
            <TextInput
              value={form.mailConfigure.host}
              onChangeText={(v) => handleMail("host", v)}
              style={G.configInput as any}
            />
          </View>

          <View style={G.configCard as any}>
            <Text style={G.configCardLabel as any}>Port</Text>
            <TextInput
              value={String(form.mailConfigure.port)}
              onChangeText={(v) => handleMail("port", Number(v))}
              keyboardType="number-pad"
              style={G.configInput as any}
            />
          </View>

          <View style={G.configCard as any}>
            <Text style={G.configCardLabel as any}>Email Address</Text>
            <TextInput
              value={form.mailConfigure.auth.user}
              onChangeText={(v) => handleMail("user", v)}
              keyboardType="email-address"
              style={G.configInput as any}
            />
          </View>

          <View style={G.configCard as any}>
            <Text style={G.configCardLabel as any}>App Password</Text>
            <View style={G.configPassRow as any}>
              <TextInput
                value={form.mailConfigure.auth.pass}
                onChangeText={(v) => handleMail("pass", v)}
                secureTextEntry={!showPass}
                style={[G.configInput, { flex: 1 }] as any}
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                <Text style={G.configEyeText as any}>{showPass ? "🙈" : "👁️"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── Database Info Tab ── */}
      {activeTab === "db" && (
        <View style={G.configMailSection as any}>
          <View style={G.configCard as any}>
            <Text style={G.configCardLabel as any}>Tenant Database Name (Encoded PAN)</Text>
            <Text style={[G.configInput, { color: "#00e5ff", fontWeight: "bold" }] as any}>
              {(user as any)?.corporates?.[0]?.apiUrls?.tenantDb?.dbName || "Not Provisioned"}
            </Text>
          </View>

          <View style={G.configCard as any}>
            <Text style={G.configCardLabel as any}>Database Access Password</Text>
            <View style={G.configPassRow as any}>
              <Text style={[G.configInput, { flex: 1, color: "#aaa" }] as any}>
                {showPass ? ((user as any)?.corporates?.[0]?.apiUrls?.tenantDb?.dbPassword || "N/A") : "••••••••••••••••"}
              </Text>
              <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                <Text style={G.configEyeText as any}>{showPass ? "🙈" : "👁️"}</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: "#5a7a8a", fontSize: 11, marginTop: 8 }}>
              Derived from: PAN + DOB (ddmmyyyy)
            </Text>
          </View>
          
          <View style={[G.configCard, { borderColor: "rgba(0,229,255,0.2)", borderStyle: "dashed" }] as any}>
            <Text style={[G.configCardLabel, { color: "#00e5ff" }] as any}>Infrastructure Status</Text>
            <Text style={{ color: "#fff", fontSize: 13 }}>
              Status: <Text style={{ color: "#4caf50" }}>Connected & Isolated</Text>
            </Text>
            <Text style={{ color: "#7a9aaa", fontSize: 12, marginTop: 4 }}>
              Host: Shared Cluster (Default)
            </Text>
          </View>

          {user?.userRole === "CorpAdmin" && (
            <TouchableOpacity 
              style={[G.primaryButton, { backgroundColor: "#00e5ff22", borderColor: "#00e5ff", borderWidth: 1, marginTop: 20 }] as any}
              onPress={handleProvision}
              disabled={provisioning}
            >
              <Text style={[G.primaryButtonText, { color: "#00e5ff" }] as any}>
                {provisioning ? "⚙️ Provisioning..." : "🛠️ Provision Infrastructure"}
              </Text>
            </TouchableOpacity>
          )}

          <Text style={{ color: "#5a7a8a", fontSize: 11, textAlign: "center", marginTop: 15, paddingHorizontal: 20 }}>
            Provisioning ensures your dedicated user, database, and all required collections are active on the cluster.
          </Text>
        </View>
      )}

      </ScrollView>
    </SafeAreaView>
  );
}