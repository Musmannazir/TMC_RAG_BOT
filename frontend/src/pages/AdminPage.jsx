import React, { useState, useEffect } from "react";

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch users when page loads
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("token"); // Or however you store your JWT
      const res = await fetch("http://localhost:8000/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch users or unauthorized.");
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveUser = async (userId) => {
    if (!window.confirm("Are you sure you want to remove this user?")) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`http://localhost:8000/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        // Remove from local UI state immediately
        setUsers(users.filter((user) => user.id !== userId));
        alert("User removed successfully.");
      } else {
        const errData = await res.json();
        alert(`Error: ${errData.detail || "Could not delete user"}`);
      }
    } catch (err) {
      alert("An error occurred while deleting the user.");
    }
  };

  if (loading) return <div className="p-8 text-center">Loading Admin Panel...</div>;
  if (error) return <div className="p-8 text-red-500 text-center">Error: {error}</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-slate-800">Admin Dashboard</h1>
      <p className="text-slate-600 mb-6">Manage users and permissions across tenants.</p>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">User ID</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Org ID (Tenant)</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Role</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-6 py-4 text-sm text-slate-900">{user.id}</td>
                <td className="px-6 py-4 text-sm text-slate-900">{user.email}</td>
                <td className="px-6 py-4 text-sm text-indigo-600 font-medium">{user.org_id}</td>
                <td className="px-6 py-4 text-sm text-slate-500">
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm font-medium text-right">
                  <button
                    onClick={() => handleRemoveUser(user.id)}
                    className="text-red-600 hover:text-red-900 ml-4 font-semibold"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}