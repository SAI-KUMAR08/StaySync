import { MdInbox } from "react-icons/md";

const EmptyState = ({ icon: Icon, title, description, action, size = "md" }) => {
  const IconComponent = Icon || MdInbox;
  return (
    <div className="empty-state">
      <IconComponent className="empty-state-icon" />
      <p className="empty-state-title">{title || "Nothing here yet"}</p>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};

export default EmptyState;
