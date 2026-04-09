import type { Response } from "express";

type Client = {
  id: string;
  response: Response;
};

const rooms = new Map<string, Map<string, Client>>();

export const addClient = (roomId: string, clientId: string, response: Response): void => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }

  rooms.get(roomId)?.set(clientId, { id: clientId, response });
};

export const removeClient = (roomId: string, clientId: string): void => {
  const room = rooms.get(roomId);
  if (!room) return;

  room.delete(clientId);

  if (room.size === 0) {
    rooms.delete(roomId);
  }
};

export const broadcastToRoom = (roomId: string, eventName: string, payload: unknown): void => {
  const room = rooms.get(roomId);
  if (!room) return;

  const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const client of room.values()) {
    client.response.write(message);
  }
};

export const getRoomSize = (roomId: string): number => {
  return rooms.get(roomId)?.size ?? 0;
};
