import React, { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";


// Visual mapping for role badges — extend here if you add more roles later
const ROLE_COLORS = {
  admin: { bg: "rgba(248, 113, 113, 0.15)", fg: "#f87171", border: "rgba(248, 113, 113, 0.3)" },
  hr: { bg: "rgba(96, 165, 250, 0.15)", fg: "#60a5fa", border: "rgba(96, 165, 250, 0.3)" },
  employee: { bg: "rgba(139, 197, 63, 0.15)", fg: "#8BC53F", border: "rgba(139, 197, 63, 0.3)" },
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("organizations");
  
  // Data States
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [documents, setDocuments] = useState([]);

  // Loading & Action States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Form Inputs
  const [newOrgName, setNewOrgName] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadFolder, setUploadFolder] = useState("public");

  const token = localStorage.getItem("token");

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      if (activeTab === "users") {
        await fetchUsers();
      } else {
        await fetchOrganizations();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    const res = await fetch("${API_URL}/api/admin/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load user database mapping.");
    const data = await res.json();
    setUsers(data);
  };

  const fetchOrganizations = async () => {
    const res = await fetch("${API_URL}/api/admin/organizations", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load organization tenants.");
    const data = await res.json();
    setOrganizations(data);
  };

  const fetchDocuments = async (orgId) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/organizations/${orgId}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not load documents for this organization.");
      const data = await res.json();
      setDocuments(data);
      setSelectedOrg(orgId);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    const cleanName = newOrgName.trim().toLowerCase();
    if (!cleanName) return;

    try {
      const formData = new FormData();
      formData.append("org_id", cleanName);

      const res = await fetch(`${API_URL}/api/admin/organizations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        alert(`Organization '${cleanName}' created successfully.`);
        setNewOrgName("");
        fetchOrganizations();
      } else {
        const errData = await res.json();
        alert(errData.detail || "Failed to create organization.");
      }
    } catch (err) {
      alert("Error occurred while creating organization.");
    }
  };

  const handleDeleteOrg = async (orgId) => {
    if (!window.confirm(`WARNING: This will completely delete organization '${orgId}' and ALL of its uploaded files. Continue?`)) return;

    try {
      const res = await fetch(`${API_URL}/api/admin/organizations/${orgId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        alert("Organization deleted successfully.");
        if (selectedOrg === orgId) {
          setSelectedOrg(null);
          setDocuments([]);
        }
        fetchOrganizations();
      } else {
        alert("Failed to delete organization.");
      }
    } catch (err) {
      alert("Error deleting organization.");
    }
  };

  const handleUploadFile = async (e) => {
    e.preventDefault();
    if (!selectedFile || !selectedOrg) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("folder", uploadFolder);

    try {
      const res = await fetch(`${API_URL}/api/admin/organizations/${selectedOrg}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        alert("Document uploaded successfully.");
        setSelectedFile(null);
        document.getElementById("admin-file-upload").value = "";
        fetchDocuments(selectedOrg);
        fetchOrganizations();
      } else {
        alert("Failed to upload document.");
      }
    } catch (err) {
      alert("Error occurred during document upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete '${filename}'?`)) return;

    try {
      const res = await fetch(`${API_URL}/api/admin/organizations/${selectedOrg}/documents/${filename}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        alert("Document deleted.");
        fetchDocuments(selectedOrg);
        fetchOrganizations();
      } else {
        alert("Failed to delete document.");
      }
    } catch (err) {
      alert("Error deleting document.");
    }
  };

  const handleTriggerIngestion = async () => {
    if (!window.confirm("This will rebuild the vector database index. Users might experience brief latency during updates. Continue?")) return;

    setIngesting(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/ingest`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        alert("Ingestion started in the background. Your FAISS index will update shortly!");
      } else {
        alert("Failed to initiate ingestion pipeline.");
      }
    } catch (err) {
      alert("Error executing ingestion pipeline.");
    } finally {
      setIngesting(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (!window.confirm(`Change this user's role to "${newRole}"?`)) return;

    try {
      const formData = new FormData();
      formData.append("role", newRole);

      const res = await fetch(`${API_URL}/api/admin/users/${userId}/role`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
        );
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.detail || "Could not update role"}`);
      }
    } catch (err) {
      alert("An error occurred while updating the role.");
    }
  };

  const handleRemoveUser = async (userId) => {
    if (!window.confirm("Are you sure you want to remove this user?")) return;

    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setUsers(users.filter((user) => user.id !== userId));
        alert("User removed successfully.");
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.detail || "Could not delete user"}`);
      }
    } catch (err) {
      alert("An error occurred.");
    }
  };

  return (
    <div style={{ background: "#050a12", minHeight: "100vh", color: "#f3f4f6", padding: "40px", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        
        {/* HEADER AREA */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "35px", borderBottom: "1px solid rgba(139, 197, 63, 0.2)", paddingBottom: "20px" }}>
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: "800", color: "#fff", margin: "0 0 8px", letterSpacing: "-0.5px" }}>
              OmniRAG <span style={{ color: "#8BC53F" }}>Admin Console</span>
            </h1>
            <p style={{ color: "#9ca3af", margin: 0, fontSize: "14px" }}>Manage multi-tenant organizations, documents, vector indexing, and credentials.</p>
          </div>

          <button 
            onClick={handleTriggerIngestion}
            disabled={ingesting}
            style={{
              background: "#8BC53F",
              color: "#020408",
              border: "none",
              padding: "12px 24px",
              borderRadius: "8px",
              fontWeight: "700",
              cursor: ingesting ? "not-allowed" : "pointer",
              boxShadow: "0 0 15px rgba(139, 197, 63, 0.4)",
              transition: "transform 0.2s, opacity 0.2s",
              opacity: ingesting ? 0.7 : 1
            }}
          >
            {ingesting ? "⚡ Rebuilding Database..." : "🔥 Ingest & Rebuild FAISS Index"}
          </button>
        </div>

        {/* TABS NAVIGATION */}
        <div style={{ display: "flex", gap: "15px", marginBottom: "30px" }}>
          <button 
            onClick={() => { setActiveTab("organizations"); setSelectedOrg(null); }}
            style={{
              background: activeTab === "organizations" ? "#0d1b30" : "transparent",
              border: "1px solid",
              borderColor: activeTab === "organizations" ? "#8BC53F" : "rgba(255,255,255,0.1)",
              color: activeTab === "organizations" ? "#8BC53F" : "#9ca3af",
              padding: "12px 22px",
              borderRadius: "6px",
              fontWeight: "700",
              cursor: "pointer",
              fontSize: "14px",
              transition: "all 0.2s"
            }}
          >
            📁 Manage Tenants & Documents
          </button>
          <button 
            onClick={() => setActiveTab("users")}
            style={{
              background: activeTab === "users" ? "#0d1b30" : "transparent",
              border: "1px solid",
              borderColor: activeTab === "users" ? "#8BC53F" : "rgba(255,255,255,0.1)",
              color: activeTab === "users" ? "#8BC53F" : "#9ca3af",
              padding: "12px 22px",
              borderRadius: "6px",
              fontWeight: "700",
              cursor: "pointer",
              fontSize: "14px",
              transition: "all 0.2s"
            }}
          >
            👥 Manage Credentials
          </button>
          <button 
            onClick={() => window.location.href = "/"}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#f3f4f6",
              padding: "10px 20px",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: "600"
            }}
          >
            ◀ Back to Workspace
          </button>
        </div>

        {error && (
          <div style={{ background: "rgba(248, 113, 113, 0.15)", border: "1px solid #f87171", color: "#f87171", padding: "14px", borderRadius: "8px", marginBottom: "20px" }}>
            Error: {error}
          </div>
        )}

        {/* CORE CONTENT RENDER */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#9ca3af", fontSize: "16px" }}>Loading Admin Records...</div>
        ) : activeTab === "organizations" ? (
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px" }}>
            
            {/* LEFT SIDE: ORGANIZATIONS LIST & CREATION */}
            <div>
              <div style={{ background: "#0d1b30", border: "1px solid rgba(139, 197, 63, 0.15)", borderRadius: "10px", padding: "20px", marginBottom: "25px" }}>
                <h3 style={{ color: "#fff", margin: "0 0 15px", fontWeight: "700", fontSize: "16px" }}>➕ Register New Tenant</h3>
                <form onSubmit={handleCreateOrg} style={{ display: "flex", gap: "10px" }}>
                  <input 
                    type="text" 
                    placeholder="e.g. giki, lums, pgc" 
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    style={{
                      flex: 1,
                      background: "#050a12",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "6px",
                      padding: "12px 14px",
                      color: "#fff",
                      fontSize: "14px"
                    }}
                  />
                  <button type="submit" style={{ background: "#8BC53F", color: "#020408", border: "none", padding: "10px 18px", borderRadius: "6px", fontWeight: "700", cursor: "pointer", fontSize: "14px" }}>
                    Create Tenant
                  </button>
                </form>
              </div>

              <div style={{ background: "#0d1b30", border: "1px solid rgba(139, 197, 63, 0.15)", borderRadius: "10px", padding: "20px" }}>
                <h3 style={{ color: "#fff", margin: "0 0 15px", fontWeight: "700", fontSize: "16px" }}>🏢 Tenant Organizations</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {organizations.length === 0 ? (
                    <p style={{ color: "#9ca3af", margin: 0, fontSize: "14px" }}>No active organizations found.</p>
                  ) : (
                    organizations.map((org) => (
                      <div 
                        key={org.org_id} 
                        onClick={() => fetchDocuments(org.org_id)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          background: selectedOrg === org.org_id ? "rgba(139, 197, 63, 0.1)" : "#050a12",
                          border: "1px solid",
                          borderColor: selectedOrg === org.org_id ? "#8BC53F" : "rgba(255,255,255,0.06)",
                          padding: "16px",
                          borderRadius: "8px",
                          cursor: "pointer",
                          transition: "all 0.15s ease"
                        }}
                      >
                        <div>
                          <strong style={{ color: "#fff", textTransform: "uppercase", fontSize: "15px", letterSpacing: "0.5px" }}>{org.org_id}</strong>
                          <span style={{ marginLeft: "10px", fontSize: "12px", color: "#9ca3af" }}>({org.document_count} files)</span>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteOrg(org.org_id); }}
                          style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontWeight: "700", fontSize: "13px" }}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT SIDE: DOCUMENT VIEWER & FILE UPLOADER */}
            <div>
              {selectedOrg ? (
                <div style={{ background: "#0d1b30", border: "1px solid rgba(139, 197, 63, 0.15)", borderRadius: "10px", padding: "20px" }}>
                  <h3 style={{ color: "#fff", margin: "0 0 15px", fontWeight: "700", textTransform: "uppercase", fontSize: "16px" }}>
                    📁 Documents inside <span style={{ color: "#8BC53F" }}>{selectedOrg}</span>
                  </h3>

                  {/* FILE UPLOAD BOX */}
                  <form onSubmit={handleUploadFile} style={{ background: "#050a12", padding: "20px", borderRadius: "8px", marginBottom: "20px", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                      <input 
                        id="admin-file-upload"
                        type="file" 
                        onChange={(e) => setSelectedFile(e.target.files[0])}
                        style={{ color: "#9ca3af", fontSize: "14px" }}
                      />
                      
                      {selectedOrg === "tmc" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <label style={{ fontSize: "13px", color: "#9ca3af" }}>Visibility Folder (required):</label>
                          <select 
                            value={uploadFolder} 
                            onChange={(e) => setUploadFolder(e.target.value)}
                            style={{ background: "#0d1b30", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", padding: "6px 10px", fontSize: "13px" }}
                          >
                            <option value="public">🟢 Public Folder — every TMC employee can see this</option>
                            <option value="policy">🔴 Policy Folder — HR/Admin only, hidden from employees</option>
                          </select>
                          {uploadFolder === "policy" && (
                            <p style={{ margin: 0, fontSize: "12px", color: "#f87171" }}>
                              ⚠️ This document will be restricted to HR and Admin roles only.
                            </p>
                          )}
                        </div>
                      ) : (
                        <p style={{ margin: 0, fontSize: "12px", color: "#9ca3af" }}>
                          🟢 This organization has no HR/policy split — this document will be visible to all {selectedOrg} employees.
                        </p>
                      )}

                      <button 
                        type="submit" 
                        disabled={uploading || !selectedFile}
                        style={{
                          background: "#8BC53F",
                          color: "#020408",
                          border: "none",
                          padding: "12px",
                          borderRadius: "6px",
                          fontWeight: "700",
                          cursor: selectedFile ? "pointer" : "not-allowed",
                          opacity: selectedFile ? 1 : 0.6,
                          fontSize: "14px"
                        }}
                      >
                        {uploading ? "Uploading file..." : "Upload File to Workspace"}
                      </button>
                    </div>
                  </form>

                  {/* DOCUMENTS GRID LIST */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "400px", overflowY: "auto" }}>
                    {documents.length === 0 ? (
                      <p style={{ color: "#9ca3af", margin: 0, padding: "20px 0", textAlign: "center", fontSize: "14px" }}>No documents uploaded yet inside this tenant workspace.</p>
                    ) : (
                      documents.map((doc) => {
                        // Derive visibility the same way ingest.py does: policy/public
                        // subfolder for tmc, otherwise everything is public.
                        const topFolder = doc.relative_path.includes("/") ? doc.relative_path.split("/")[0] : null;
                        const isPolicy = selectedOrg === "tmc" && topFolder === "policy";
                        return (
                        <div 
                          key={doc.relative_path}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background: "#050a12",
                            padding: "14px",
                            borderRadius: "6px",
                            border: "1px solid rgba(255,255,255,0.03)"
                          }}
                        >
                          <div>
                            <p style={{ margin: "0 0 4px", fontSize: "14px", fontWeight: "600", color: "#fff" }}>📄 {doc.relative_path}</p>
                            <span style={{ fontSize: "11px", color: "#9ca3af", marginRight: "8px" }}>Size: {doc.size_kb} KB</span>
                            <span style={{
                              fontSize: "10px",
                              fontWeight: "700",
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                              padding: "2px 8px",
                              borderRadius: "10px",
                              background: isPolicy ? "rgba(248, 113, 113, 0.15)" : "rgba(139, 197, 63, 0.15)",
                              color: isPolicy ? "#f87171" : "#8BC53F",
                              border: `1px solid ${isPolicy ? "rgba(248, 113, 113, 0.3)" : "rgba(139, 197, 63, 0.3)"}`
                            }}>
                              {isPolicy ? "🔴 HR/Admin only" : "🟢 All employees"}
                            </span>
                          </div>
                          <button 
                            onClick={() => handleDeleteDoc(doc.relative_path)}
                            style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: "13px", fontWeight: "700" }}
                          >
                            Remove
                          </button>
                        </div>
                        );
                      })
                    )}
                  </div>

                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "2px dashed rgba(139, 197, 63, 0.2)", borderRadius: "10px", minHeight: "350px", color: "#9ca3af", padding: "20px" }}>
                  <span style={{ fontSize: "36px", marginBottom: "10px" }}></span>
                  <p style={{ margin: 0, fontSize: "14px", textAlign: "center" }}>Select an organization from the left panel to view, manage, and upload policy files.</p>
                </div>
              )}
            </div>

          </div>

        ) : (
          
          /* USERS (CREDENTIALS) LIST TABLE */
          <div style={{ background: "#0d1b30", border: "1px solid rgba(139, 197, 63, 0.15)", borderRadius: "10px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#050a12", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
                  <th style={{ padding: "18px 20px", fontSize: "13px", fontWeight: "700", color: "#8BC53F", textTransform: "uppercase" }}>User ID</th>
                  <th style={{ padding: "18px 20px", fontSize: "13px", fontWeight: "700", color: "#8BC53F", textTransform: "uppercase" }}>Email Address</th>
                  <th style={{ padding: "18px 20px", fontSize: "13px", fontWeight: "700", color: "#8BC53F", textTransform: "uppercase" }}>Organization (Tenant)</th>
                  <th style={{ padding: "18px 20px", fontSize: "13px", fontWeight: "700", color: "#8BC53F", textTransform: "uppercase" }}>System Role</th>
                  <th style={{ padding: "18px 20px", fontSize: "13px", fontWeight: "700", color: "#8BC53F", textTransform: "uppercase", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ padding: "30px", textAlign: "center", color: "#9ca3af" }}>No registered system credentials found.</td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", transition: "background 0.15s" }}>
                      <td style={{ padding: "18px 20px", fontSize: "14px", color: "#fff" }}>{user.id}</td>
                      <td style={{ padding: "18px 20px", fontSize: "14px", color: "#fff" }}>{user.email}</td>
                      <td style={{ padding: "18px 20px", fontSize: "14px", textTransform: "uppercase", fontWeight: "700", color: "#8BC53F" }}>{user.org_id || "global"}</td>
                      <td style={{ padding: "18px 20px" }}>
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          style={{
                            background: ROLE_COLORS[user.role]?.bg || "rgba(156, 163, 175, 0.15)",
                            color: ROLE_COLORS[user.role]?.fg || "#9ca3af",
                            border: "1px solid",
                            borderColor: ROLE_COLORS[user.role]?.border || "rgba(156, 163, 175, 0.3)",
                            padding: "4px 10px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: "700",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            cursor: "pointer"
                          }}
                        >
                          <option value="employee">employee</option>
                          <option value="hr">hr</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td style={{ padding: "18px 20px", textAlign: "right" }}>
                        <button 
                          onClick={() => handleRemoveUser(user.id)}
                          style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontWeight: "700", fontSize: "14px" }}
                        >
                          Remove Account
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        )}

      </div>
    </div>
  );
}
