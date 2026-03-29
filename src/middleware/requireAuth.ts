import type { Request, Response, NextFunction } from "express";

const requireAuth = (request: Request, response: Response, next: NextFunction): void => {
  if (!request.session.userId) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};

export default requireAuth;
