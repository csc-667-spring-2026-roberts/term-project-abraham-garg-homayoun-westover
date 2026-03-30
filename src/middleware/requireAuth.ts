import type { Request, Response, NextFunction } from "express";

const requireAuth = (request: Request, response: Response, next: NextFunction): void => {
  if (!request.session.userId) {
    response.redirect("/auth/login");
    return;
  }

  next();
};

export default requireAuth;
