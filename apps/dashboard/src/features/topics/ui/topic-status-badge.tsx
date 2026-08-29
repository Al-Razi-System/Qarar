import { Route } from "lucide-react";
import {
  routingStatusLabel,
  topicPriority,
  topicStatus,
  type Topic,
} from "../model/topic-view";

export function TopicStatusBadge({ topic }: { topic: Topic }) {
  const meta = topicStatus(topic);
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ring-inset ${meta.className}`}>{meta.label}</span>;
}

export function TopicPriorityBadge({ topic }: { topic: Topic }) {
  const meta = topicPriority(topic);
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${meta.className}`}>{meta.label}</span>;
}

export function TopicRoutingBadge({ topic }: { topic: Topic }) {
  if (!topic.routing_status) return null;
  return <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7e8] px-2.5 py-1 text-[10px] font-black text-[#a65400] ring-1 ring-inset ring-[#ffd9a8]">
    <Route size={11} /> {routingStatusLabel(topic.routing_status)}
  </span>;
}

