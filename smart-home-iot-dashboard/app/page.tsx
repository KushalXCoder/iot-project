"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Activity, AirVent, AlertTriangle, ArrowUpRight, Bell, Camera, Check,
  ChevronRight, Clock3, Fan, Home, LayoutDashboard, Lightbulb, LockKeyhole,
  LogIn, LogOut, Menu, Mic, Music2, Pause, Play, Plus, Search, Settings,
  ShieldAlert, ShieldCheck, Smartphone, Speaker, UserRound, Users, Video,
  Volume2, VolumeX, Wifi, X, Zap
} from "lucide-react";
import ESP32Camera from "../components/ESP32Camera";
import AudioPlayer from "../components/AudioPlayer";

type Device = { id: number; name: string; room: string; type: string; status: "Connected" | "Disconnected" | "Offline"; detail: string; icon: "camera" | "speaker" | "lock" | "light" | "ac" | "fan" };
type View = "Overview" | "Devices" | "People" | "Security" | "Audio";

const initialDevices: Device[] = [
  { id: 1, name: "Entrance Camera", room: "Living Room", type: "Camera", status: "Connected", detail: "Live monitoring", icon: "camera" },
  { id: 2, name: "Wi-Fi Speaker", room: "Living Room", type: "Audio", status: "Connected", detail: "Ready to play", icon: "speaker" },
  { id: 3, name: "RFID Door Lock", room: "Entrance", type: "Access", status: "Connected", detail: "Door locked", icon: "lock" },
  { id: 4, name: "Ceiling Light", room: "Bedroom", type: "Lighting", status: "Connected", detail: "Brightness · 70%", icon: "light" },
  { id: 5, name: "Air Conditioner", room: "Bedroom", type: "Climate", status: "Offline", detail: "Last seen 12 min ago", icon: "ac" },
  { id: 6, name: "Ventilation Fan", room: "Kitchen", type: "Appliance", status: "Disconnected", detail: "Needs attention", icon: "fan" }
];
const rooms = ["All rooms", "Living Room", "Bedroom", "Kitchen", "Entrance"];

function DeviceIcon({ kind, size = 25 }: { kind: Device["icon"]; size?: number }) {
  const props = { size, strokeWidth: 1.65 };
  if (kind === "camera") return <Camera {...props} />;
  if (kind === "speaker") return <Speaker {...props} />;
  if (kind === "lock") return <LockKeyhole {...props} />;
  if (kind === "light") return <Lightbulb {...props} />;
  if (kind === "ac") return <AirVent {...props} />;
  return <Fan {...props} />;
}

function StatusPill({ status }: { status: Device["status"] }) {
  const connected = status === "Connected";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${connected ? "bg-[#e9f8f1] text-[#219967]" : status === "Offline" ? "bg-[#fff0ed] text-[#dc644c]" : "bg-[#fff7e6] text-[#bd8521]"}`}>
    <i className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-[#2ab77c]" : status === "Offline" ? "bg-[#e8755b]" : "bg-[#d6a033]"}`} />{status}
  </span>;
}

function Auth({ onLogin }: { onLogin: () => void }) {
  const [signup, setSignup] = useState(false);
  const submit = (event: FormEvent) => { event.preventDefault(); onLogin(); };
  return <main className="auth-page"><div className="auth-art"><div className="auth-brand"><span><Wifi size={19} /></span> haven</div><div className="auth-copy"><p className="eyebrow">YOUR HOME, IN ONE PLACE</p><h1>Peace of mind,<br /><em>connected.</em></h1><p>Keep an eye on everything that matters with a smarter, safer home.</p><div className="auth-status"><span className="pulse" /> All systems operational</div></div><div className="auth-orbit"><div className="orbit-dot"><ShieldCheck size={18} /></div><div className="orbit-core"><Home size={42} /></div></div></div><section className="auth-form"><div className="auth-form-inner"><div className="mobile-brand"><span><Wifi size={17} /></span> haven</div><p className="eyebrow">{signup ? "WELCOME TO HAVEN" : "WELCOME BACK"}</p><h2>{signup ? "Create your account" : "Sign in to your home"}</h2><p className="form-sub">{signup ? "Set up your secure home dashboard in minutes." : "Your home is waiting for you."}</p><form onSubmit={submit}>{signup && <label>Full name<input required placeholder="Kiran Rao" /></label>}<label>Email address<input required type="email" placeholder="you@example.com" /></label><label>Password<input required type="password" placeholder="••••••••" /></label>{!signup && <div className="form-row"><label className="check"><input type="checkbox" /> Remember me</label><button type="button" className="text-button">Forgot password?</button></div>}<button className="primary-button" type="submit">{signup ? "Create account" : "Sign in"}<ChevronRight size={17} /></button></form><div className="auth-switch">{signup ? "Already have an account?" : "New to haven?"} <button onClick={() => setSignup(!signup)}>{signup ? "Sign in" : "Create an account"}</button></div><p className="secure-note"><ShieldCheck size={14} /> Your data is encrypted and private</p></div></section></main>;
}

export default function Page() {
  const [authenticated, setAuthenticated] = useState(false);
  const [view, setView] = useState<View>("Overview");
  const [devices, setDevices] = useState(initialDevices);
  const [room, setRoom] = useState("All rooms");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [mobile, setMobile] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newDevice, setNewDevice] = useState({ name: "", room: "Living Room", type: "Camera" });
  const [showWarning, setShowWarning] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const connected = devices.filter(d => d.status === "Connected").length;
  const filtered = devices.filter(d => (room === "All rooms" || d.room === room) && `${d.name} ${d.room} ${d.type}`.toLowerCase().includes(search.toLowerCase()));
  useEffect(() => () => streamRef.current?.getTracks().forEach(track => track.stop()), []);
  if (!authenticated) return <Auth onLogin={() => setAuthenticated(true)} />;

  const toggleStatus = (id: number) => setDevices(current => current.map(d => d.id === id ? { ...d, status: d.status === "Connected" ? "Disconnected" : "Connected", detail: d.status === "Connected" ? "Manually disconnected" : "Ready" } : d));
  const addDevice = (event: FormEvent) => {
    event.preventDefault();
    if (!newDevice.name.trim()) return;
    setDevices(current => [...current, { id: Date.now(), name: newDevice.name.trim(), room: newDevice.room, type: newDevice.type, status: "Connected", detail: "Ready", icon: newDevice.type === "Camera" ? "camera" : newDevice.type === "Audio" ? "speaker" : "light" }]);
    setNewDevice({ name: "", room: "Living Room", type: "Camera" }); setShowAdd(false); notify("Device added successfully");
  };
  const nav = [{ label: "Overview", icon: LayoutDashboard }, { label: "Devices", icon: Smartphone }, { label: "People", icon: Users }, { label: "Security", icon: ShieldAlert }, { label: "Audio", icon: Speaker }];
  const openCamera = async () => {
    try { streamRef.current = await navigator.mediaDevices.getUserMedia({ video: true }); if (videoRef.current) videoRef.current.srcObject = streamRef.current; } catch { notify("Camera permission is needed to capture an intruder"); }
  };
  const capture = () => { const video = videoRef.current; if (!video || video.readyState < 2) { notify("Start the camera before capturing"); return; } const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext("2d")?.drawImage(video, 0, 0); setCaptured(canvas.toDataURL("image/jpeg")); streamRef.current?.getTracks().forEach(track => track.stop()); notify("Evidence snapshot saved locally"); };

  return <main className="app-shell"><aside className={`sidebar ${mobile ? "open" : ""}`}><div className="brand"><span><Wifi size={18} /></span> haven</div><p className="side-label">Workspace</p><nav>{nav.map(item => <button key={item.label} className={view === item.label ? "active" : ""} onClick={() => { setView(item.label as View); setMobile(false); }}><item.icon size={18} />{item.label}</button>)}</nav><p className="side-label setup-label">Manage</p><button className="side-action" onClick={() => setShowAdd(true)}><Plus size={18} /> Add device</button><button className="side-action" onClick={() => notify("Settings are ready for your preferences")}><Settings size={18} /> Settings</button><div className="side-bottom"><div className="avatar">KR</div><div><strong>Kiran Rao</strong><small>Home owner</small></div><button aria-label="Sign out" onClick={() => setAuthenticated(false)}><LogOut size={17} /></button></div></aside>{mobile && <button className="mobile-overlay" onClick={() => setMobile(false)} aria-label="Close menu" />}
    <section className="content"><header className="topbar"><button className="menu-button" onClick={() => setMobile(true)}><Menu size={21} /></button><div><p className="breadcrumb">HAVEN / HOME</p><h1>{view === "Overview" ? "Good morning, Kiran" : view}</h1></div><div className="top-actions"><div className="searchbox"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search anything..." /></div><button className="icon-button notification" onClick={() => notify("No new notifications")}><Bell size={18} /><i /></button><button className="profile-button" onClick={() => setView("People")}><span className="avatar small">KR</span><span className="profile-name">Kiran Rao</span></button></div></header>
      {view === "Overview" && <Overview connected={connected} devices={devices} onNavigate={setView} onWarning={() => setShowWarning(true)} />}
      {view === "Devices" && <Devices devices={filtered} room={room} setRoom={setRoom} onToggle={toggleStatus} onAdd={() => setShowAdd(true)} />}
      {view === "People" && <People onNotify={notify} />}
      {view === "Security" && <Security />}
      {view === "Audio" && <AudioPlayer />}
    </section>
    {showAdd && <div className="modal-backdrop" onMouseDown={() => setShowAdd(false)}><form className="modal" onSubmit={addDevice} onMouseDown={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setShowAdd(false)}><X size={18} /></button><div className="modal-icon"><Plus size={20} /></div><p className="eyebrow">DEVICE SETUP</p><h2>Add a new device</h2><p className="form-sub">Register hardware to monitor it from haven.</p><label>Device name<input autoFocus required value={newDevice.name} onChange={event => setNewDevice({ ...newDevice, name: event.target.value })} placeholder="e.g. Hallway sensor" /></label><div className="two-fields"><label>Room<select value={newDevice.room} onChange={event => setNewDevice({ ...newDevice, room: event.target.value })}>{rooms.slice(1).map(r => <option key={r}>{r}</option>)}</select></label><label>Type<select value={newDevice.type} onChange={event => setNewDevice({ ...newDevice, type: event.target.value })}><option>Camera</option><option>Audio</option><option>Lighting</option><option>Climate</option></select></label></div><button className="primary-button" type="submit">Add device <Check size={17} /></button></form></div>}
    {showWarning && <WarningModal videoRef={videoRef} captured={captured} onClose={() => { setShowWarning(false); streamRef.current?.getTracks().forEach(track => track.stop()); }} onStart={openCamera} onCapture={capture} />}
    {toast && <div className="toast"><Check size={15} />{toast}</div>}</main>;
}

function Overview({ connected, devices, onNavigate, onWarning }: { connected: number; devices: Device[]; onNavigate: (view: View) => void; onWarning: () => void }) {
  return <div className="page-body"><div className="hero-row"><div><p className="eyebrow">WEDNESDAY, NOVEMBER 4, 2026</p><h2>Your home at a glance</h2><p className="muted">Everything is calm and connected.</p></div><button className="warning-button" onClick={onWarning}><ShieldAlert size={17} /> Security alert</button></div><div className="stats-grid"><Stat icon={Smartphone} label="Total devices" value={devices.length} note="Across 4 rooms" /><Stat icon={Activity} label="Connected now" value={connected} note="Everything looks good" green /><Stat icon={AlertTriangle} label="Needs attention" value={devices.length - connected} note="Offline or disconnected" orange /><Stat icon={Users} label="Known people" value="Manage" note="Open People to view enrolled profiles" /></div><div className="overview-grid"><section className="panel device-panel"><div className="panel-heading"><div><h3>Device status</h3><p>Live connection overview</p></div><button className="link-button" onClick={() => onNavigate("Devices")}>View all <ArrowUpRight size={15} /></button></div><div className="status-list">{devices.slice(0, 5).map(device => <div className="status-row" key={device.id}><div className="device-mini"><span className="mini-icon"><DeviceIcon kind={device.icon} size={17} /></span><div><strong>{device.name}</strong><small>{device.room} · {device.type}</small></div></div><StatusPill status={device.status} /><ChevronRight size={16} className="row-arrow" /></div>)}</div></section><section className="panel security-card"><div className="security-illustration"><div className="ring ring-one" /><div className="ring ring-two" /><ShieldCheck size={33} /></div><p className="eyebrow">SECURITY CENTER</p><h3>Your home is protected</h3><p className="muted">Face detection is active. Identity matching will be enabled in the next stage.</p><button className="secondary-button" onClick={() => onNavigate("Security")}>Open security center <ArrowUpRight size={15} /></button></section></div><div className="lower-grid"><section className="panel activity-panel"><div className="panel-heading"><div><h3>Recent activity</h3><p>What happened around your home</p></div><Clock3 size={18} className="muted-icon" /></div><ActivityItem icon={LockKeyhole} title="Main entrance locked" detail="RFID card · Kiran Rao" time="09:42 AM" green /><ActivityItem icon={Zap} title="Air conditioner went offline" detail="Bedroom · Last seen 12 min ago" time="09:30 AM" /></section><section className="panel quick-panel"><div className="panel-heading"><div><h3>Quick actions</h3><p>Common things, one tap away</p></div></div><div className="quick-actions"><button onClick={() => onNavigate("Devices")}><Plus size={18} /><span>Add device<small>Connect new hardware</small></span><ChevronRight size={15} /></button><button onClick={() => onNavigate("People")}><Users size={18} /><span>Manage profiles<small>Known people & recognition</small></span><ChevronRight size={15} /></button><button onClick={onWarning}><ShieldAlert size={18} /><span>Security alert<small>Capture an intruder snapshot</small></span><ChevronRight size={15} /></button></div></section></div></div>;
}

function Stat({ icon: Icon, label, value, note, green, orange }: { icon: typeof Activity; label: string; value: string | number; note: string; green?: boolean; orange?: boolean }) {
  return <div className="stat-card"><div className={`stat-icon ${green ? "green" : orange ? "orange" : ""}`}><Icon size={18} /></div><p>{label}</p><strong>{value}</strong><small>{note}</small></div>;
}
function ActivityItem({ icon: Icon, title, detail, time, green }: { icon: typeof Activity; title: string; detail: string; time: string; green?: boolean }) {
  return <div className="activity-item"><span className={`activity-icon ${green ? "green" : ""}`}><Icon size={16} /></span><div><strong>{title}</strong><small>{detail}</small></div><time>{time}</time></div>;
}

function Devices({ devices, room, setRoom, onToggle, onAdd }: { devices: Device[]; room: string; setRoom: (r: string) => void; onToggle: (id: number) => void; onAdd: () => void }) {
  return <div className="page-body"><div className="hero-row"><div><p className="eyebrow">HARDWARE MONITOR</p><h2>All devices</h2><p className="muted">Manage every connected device in your home.</p></div><button className="primary-small" onClick={onAdd}><Plus size={16} /> Add device</button></div><div className="filter-row">{rooms.map(r => <button key={r} className={room === r ? "selected" : ""} onClick={() => setRoom(r)}>{r}</button>)}</div><div className="device-grid">{devices.map(d => <article className="device-card" key={d.id}><div className="device-card-top"><div className="large-device-icon"><DeviceIcon kind={d.icon} size={27} /></div><StatusPill status={d.status} /></div><p className="device-type">{d.room} · {d.type}</p><h3>{d.name}</h3><p className="device-detail">{d.detail}</p><div className="device-card-bottom"><span><Wifi size={14} /> Last checked just now</span><button aria-label={`Toggle ${d.name}`} onClick={() => onToggle(d.id)} className={`toggle ${d.status === "Connected" ? "on" : ""}`}><i /></button></div></article>)}{devices.length === 0 && <div className="empty-state">No devices match this filter.</div>}</div></div>;
}

type EnrolledPerson = {
  id: number;
  name: string;
  created_at: string;
  sample_count: number;
};

const HAVEN_API_URL =
  process.env.NEXT_PUBLIC_HAVEN_API_URL || "http://127.0.0.1:8000";

function People({ onNotify }: { onNotify: (message: string) => void }) {
  const [people, setPeople] = useState<EnrolledPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [personName, setPersonName] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [error, setError] = useState("");

  const loadPeople = async () => {
    try {
      setError("");
      const response = await fetch(`${HAVEN_API_URL}/people`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Could not load profiles (${response.status}).`);
      }
      const data: EnrolledPerson[] = await response.json();
      setPeople(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not connect to Haven backend.";
      setError(`${message} Make sure the Python backend is running.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPeople();
  }, []);

  const handleImageSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedImages(Array.from(event.target.files || []));
    setError("");
  };

  const enrollPerson = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const cleanName = personName.trim();
    if (!cleanName) {
      setError("Enter the person's name.");
      return;
    }
    if (selectedImages.length < 3 || selectedImages.length > 5) {
      setError("Select between 3 and 5 photographs.");
      return;
    }

    const formData = new FormData();
    formData.append("name", cleanName);
    selectedImages.forEach((image) => formData.append("images", image));

    setSubmitting(true);
    try {
      const response = await fetch(`${HAVEN_API_URL}/people/enroll`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.detail === "string"
            ? result.detail
            : "Profile enrollment failed."
        );
      }

      setPersonName("");
      setSelectedImages([]);
      setShowEnroll(false);
      await loadPeople();
      onNotify(`${cleanName} enrolled successfully.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Enrollment failed. Check the backend."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const removePerson = async (person: EnrolledPerson) => {
    if (!window.confirm(
      `Delete ${person.name}'s profile and stored face embeddings?`
    )) return;

    try {
      const response = await fetch(`${HAVEN_API_URL}/people/${person.id}`, {
        method: "DELETE",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Could not delete profile.");
      }

      await loadPeople();
      onNotify(`${person.name}'s profile deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profile deletion failed.");
    }
  };

  const initials = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "").join("");

  return (
    <div className="page-body">
      <div className="hero-row">
        <div>
          <p className="eyebrow">COMPUTER VISION</p>
          <h2>Known people</h2>
          <p className="muted">
            Enroll trusted people for future live face recognition.
          </p>
        </div>
        <button className="primary-small" onClick={() => {
          setError("");
          setShowEnroll(true);
        }}>
          <Plus size={16} /> Add profile
        </button>
      </div>

      <div className="profile-banner">
        <div className="profile-banner-icon"><Camera size={24} /></div>
        <div>
          <strong>Local face profile library</strong>
          <p>
            Profiles and face embeddings are stored in your local Haven SQLite
            database.
          </p>
        </div>
        <span className="active-badge"><i /> Backend connected</span>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty-state">Loading enrolled profiles...</div>
      ) : people.length === 0 ? (
        <div className="empty-state">
          No people enrolled yet. Select <strong>Add profile</strong> to create
          the first profile.
        </div>
      ) : (
        <div className="profile-grid">
          {people.map((person, index) => (
            <article className="profile-card" key={person.id}>
              <div className={`profile-avatar ${
                index % 3 === 0 ? "bg-[#f36b32]" :
                index % 3 === 1 ? "bg-[#6b7df3]" : "bg-[#2ab47d]"
              }`}>
                {initials(person.name)}
              </div>
              <div className="profile-info">
                <h3>{person.name}</h3>
                <p>Enrolled profile</p>
                <div className="confidence">
                  <span>Face samples</span>
                  <strong>{person.sample_count}</strong>
                </div>
                <div className="confidence-bar">
                  <i style={{
                    width: `${Math.min(person.sample_count / 5, 1) * 100}%`
                  }} />
                </div>
                <small>
                  <Clock3 size={13} /> Added{" "}
                  {new Date(person.created_at).toLocaleDateString()}
                </small>
              </div>
              <button
                className="more-button"
                aria-label={`Delete ${person.name}`}
                title="Delete profile"
                onClick={() => void removePerson(person)}
              >
                <X size={16} />
              </button>
            </article>
          ))}
        </div>
      )}

      <p className="privacy-note">
        <ShieldCheck size={15} />
        Original uploaded photographs are not retained by this enrollment API;
        face embeddings are stored locally.
      </p>

      {showEnroll && (
        <div className="modal-backdrop" onMouseDown={() => {
          if (!submitting) setShowEnroll(false);
        }}>
          <form
            className="modal"
            onSubmit={enrollPerson}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              disabled={submitting}
              onClick={() => setShowEnroll(false)}
            >
              <X size={18} />
            </button>
            <div className="modal-icon"><Users size={20} /></div>
            <p className="eyebrow">PROFILE ENROLLMENT</p>
            <h2>Add a person</h2>
            <p className="form-sub">
              Enter a name and select 3–5 clear photographs of the same person.
              Each photograph must contain exactly one face.
            </p>

            <label>
              Person's name
              <input
                autoFocus
                required
                value={personName}
                onChange={(event) => setPersonName(event.target.value)}
                placeholder="e.g. Kiran Rao"
                disabled={submitting}
              />
            </label>

            <label>
              Face photographs
              <input
                type="file"
                accept="image/jpeg,image/png"
                multiple
                required
                onChange={handleImageSelection}
                disabled={submitting}
              />
            </label>

            <p className="text-xs text-gray-500">
              {selectedImages.length} of 3–5 photographs selected
            </p>

            {selectedImages.length > 0 && (
              <ul className="my-3 max-h-24 overflow-y-auto text-xs text-gray-600">
                {selectedImages.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="py-1">
                    {file.name}
                  </li>
                ))}
              </ul>
            )}

            {error && <p className="my-3 text-xs text-red-600">{error}</p>}

            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? "Registering..." : "Register person"}
              {!submitting && <Check size={17} />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Security() {
  return (
    <div className="page-body">
      <div className="hero-row">
        <div>
          <p className="eyebrow">PROTECTION CENTER</p>
          <h2>Home security</h2>
          <p className="muted">
            Monitor your entrance with your ESP32-CAM.
          </p>
        </div>

        <span className="armed-badge">
          <i /> System armed
        </span>
      </div>

      <div className="security-layout">
        <section className="panel alert-panel">
          <ESP32Camera />
        </section>

        <section className="panel entry-panel">
          <div className="panel-heading">
            <div>
              <h3>Protected entry points</h3>
              <p>Monitored areas</p>
            </div>
            <LockKeyhole size={18} />
          </div>

          {["Main entrance", "Back door", "Garage door"].map(
            (entry) => (
              <div className="entry-row" key={entry}>
                <span className="entry-icon">
                  <LockKeyhole size={16} />
                </span>

                <div>
                  <strong>{entry}</strong>
                  <small>Monitoring not yet connected</small>
                </div>
              </div>
            )
          )}
        </section>
      </div>
    </div>
  );
}


function WarningModal({ videoRef, captured, onClose, onStart, onCapture }: { videoRef: React.RefObject<HTMLVideoElement | null>; captured: string | null; onClose: () => void; onStart: () => void; onCapture: () => void }) {
  return <div className="modal-backdrop"><div className="modal warning-modal"><button className="modal-close" onClick={onClose}><X size={18} /></button><div className="modal-icon danger"><ShieldAlert size={20} /></div><p className="eyebrow danger-text">SECURITY ACTION</p><h2>Capture an intruder</h2><p className="form-sub">Start your entrance camera, then take a snapshot to save evidence locally.</p><div className="camera-box">{captured ? <img src={captured} alt="Captured evidence" /> : <video ref={videoRef} autoPlay muted playsInline />}</div><div className="warning-actions"><button className="secondary-button" onClick={onStart}><Video size={16} /> Start camera</button><button className="primary-button" onClick={onCapture}><Camera size={16} /> Take picture</button></div><p className="camera-privacy"><ShieldCheck size={13} /> Camera access is requested only after you choose Start camera.</p></div></div>;
}
